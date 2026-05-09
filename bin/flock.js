#!/usr/bin/env node

import { Brain } from "../src/agents/brain.js";
import { Planner } from "../src/agents/planner.js";
import { AutonomousLoop } from "../src/agents/autonomous.js";
import { Auditor } from "../src/agents/auditor.js";
import { Coordinator } from "../src/agents/coordinator.js";
import { MemoryEngine } from "../src/memory/engine.js";
import { InitPrompt } from "../src/memory/init-prompt.js";
import readline from "readline";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import http from "http";

const CONFIG_PATH = path.join(process.env.HOME, ".flock");
const CONFIG_FILE = path.join(CONFIG_PATH, "config.json");

if (!fs.existsSync(CONFIG_PATH)) fs.mkdirSync(CONFIG_PATH, { recursive: true });
if (!fs.existsSync(path.join(CONFIG_PATH, 'skills'))) fs.mkdirSync(path.join(CONFIG_PATH, 'skills'));

const loadJSON = (file, def) => { try { return JSON.parse(fs.readFileSync(file)); } catch { return def; } };
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

let config = loadJSON(CONFIG_FILE, { agent: "local", model: "deepseek-r1:1.5b" });
try {
  const list = execSync('ollama list 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
  for (const m of ['deepseek-r1:1.5b', 'llama3.2:latest', 'qwen3.5:latest']) {
    if (list.includes(m)) { config.model = m; break; }
  }
} catch {}
saveJSON(CONFIG_FILE, config);

const brain = new Brain(config.model);
const memory = new MemoryEngine(CONFIG_PATH);
const planner = new Planner(brain, memory);
const initPrompt = new InitPrompt(CONFIG_PATH);
const autonomous = new AutonomousLoop(config.model);
const coordinator = new Coordinator(brain, CONFIG_PATH);
let conversationHistory = [];

const c = {
  green: t => chalk.hex("#4ade80")(t), orange: t => chalk.hex("#f97316")(t),
  blue: t => chalk.hex("#3b82f6")(t), dim: t => chalk.hex("#475569")(t),
  red: t => chalk.hex("#ef4444")(t), yellow: t => chalk.hex("#fbbf24")(t),
  white: t => chalk.hex("#e2e8f0")(t), lime: t => chalk.hex("#a3e635")(t),
};

function printLine(type, text) {
  const icons = { info: c.dim("·"), done: c.green("✓"), warn: c.yellow("⚠"), error: c.red("✕") };
  console.log(`  ${icons[type] || icons.info}  ${(c[type] || c.white)(text)}`);
}

function printBanner() {
  console.log("");
  console.log(c.green("  ╔═══════════════════════════════╗"));
  console.log(c.green("  ║  ") + c.lime("CUFIN") + c.green(".") + c.orange("FLOCK") + c.green("  ") + c.dim("v1.1.0 (LOCAL)  ") + c.green("║"));
  console.log(c.green("  ║  ") + c.dim("Autonomous AI OS Loop       ") + c.green("║"));
  console.log(c.green("  ╚═══════════════════════════════╝"));
  console.log("");
  printLine("info", `Engine: ${c.green("⬡ LOCAL")} (${config.model})`);
  printLine("info", `Memory: ${memory.getSkills().length} skills learned`);
  console.log("");
}

const COMMANDS = {
  // ── AGENT COMMANDS ──────────────────────────────────────
  '/@': async (input) => {
    const task = input.replace('/@', '').trim();
    if (!task) { printLine("warn", "Usage: /@ @agent task — or just type a task for auto-detect"); return; }
    const results = await coordinator.dispatch(task);
    results.forEach(r => {
      const icons = { '@auditor':'🔍', '@builder':'🔧', '@architect':'📐', '@watcher':'👁️', '@vault':'📚' };
      console.log(`  ${icons[r.agent]||'●'} ${r.agent}: ${JSON.stringify(r.result).substring(0, 300)}`);
    });
  },

  '/mission': async (input) => {
    const name = input.replace('/mission', '').trim();
    if (!name) {
      const missions = coordinator._loadMissions();
      console.log(`\n  ${c.green('⬡')} AVAILABLE MISSIONS:\n`);
      Object.entries(missions).forEach(([key, m]) => console.log(`  ${c.lime(key.padEnd(20))} ${c.dim(m.description)}`));
      console.log(`\n  Usage: /mission <name>`);
      return;
    }
    await coordinator.runMission(name);
  },

  '/chain': async (input) => {
    const commands = input.replace('/chain', '').trim().split('|').map(c => c.trim()).filter(Boolean);
    if (commands.length < 2) { printLine("warn", "Usage: /chain @agent cmd | @agent cmd | ..."); return; }
    const results = await coordinator.chain(commands);
    printLine("done", `Chain complete: ${results.length} stages`);
  },

  '/agents': () => {
    const status = coordinator.status();
    console.log(`\n  ${c.green('⬡')} AGENT ROSTER\n`);
    const icons = { auditor:'🔍', builder:'🔧', architect:'📐', watcher:'👁️', vault:'📚' };
    const roles = { auditor:'Code Auditor', builder:'System Builder', architect:'System Architect', watcher:'File Watcher', vault:'Knowledge Vault' };
    status.registered.forEach(name => {
      const spawned = status.spawned.find(s => s.name === `@${name}`);
      const state = spawned ? c.green(spawned.state) : c.dim('idle');
      console.log(`  ${icons[name]||'●'} @${name.padEnd(12)} ${state}  ${c.dim(roles[name]||'')}`);
    });
    console.log("");
  },

  // ── AUDIT ───────────────────────────────────────────────
  '/audit': async (input) => {
    const args = input.replace('/audit', '').trim();
    const quick = args.includes('--quick');
    const target = args.replace('--quick', '').trim() || '.';
    const auditor = new Auditor(brain, CONFIG_PATH);
    await auditor.audit(target, { deep: !quick, online: false, verify: true });
  },

  // ── AUTONOMOUS ──────────────────────────────────────────
  '/auto': async (input) => {
    const goal = input.replace('/auto', '').trim();
    if (!goal) { printLine("warn", "Usage: /auto <goal>"); return; }
    await autonomous.run(goal);
  },

  '/plan': async (input) => {
    const goal = input.replace('/plan', '').trim();
    if (!goal) { printLine("warn", "Usage: /plan <goal>"); return; }
    const plan = await planner.decompose(goal);
    console.log(`\n  ⬡ Plan: ${goal}\n`);
    plan.forEach(s => console.log(`  ${c.green(s.id + '.')} ${s.description}`));
    console.log("");
  },

  // ── VAULT & TAGS ────────────────────────────────────────
  '/tags': () => {
    printLine("info", "Querying vault...");
    try {
      const out = execSync('flock tag 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
      console.log("");
      out.trim().split('\n').filter(Boolean).forEach(t => console.log(`  ${c.green('#')} ${t}`));
    } catch { printLine("warn", "Run: flock tag"); }
    console.log("");
  },

  '/vault': (input) => {
    const q = input.replace('/vault', '').trim() || '#MISC';
    try {
      const out = execSync(`flock query '${q}' 2>/dev/null`, { encoding: 'utf8', timeout: 5000 });
      console.log(`\n${out.substring(0, 2000)}`);
    } catch { printLine("warn", `Run: flock query '${q}'`); }
    console.log("");
  },

  // ── INFO ────────────────────────────────────────────────
  '/skills': () => {
    const dir = path.join(CONFIG_PATH, 'skills');
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      console.log(`\n  ⬡ Skills (${files.length}):\n`);
      files.forEach(f => console.log(`  ${c.green('●')} ${f.replace('.json', '')}`));
    } catch { printLine("warn", "No skills"); }
    console.log("");
  },

  '/status': () => {
    console.log(`\n  ${c.green('🔍')} FLOCK STATUS`);
    console.log(`  ${c.dim('─────────────────')}`);
    console.log(`  Engine : ${c.green('⬡')} ${config.model}`);
    console.log(`  Skills : ${memory.getSkills().length} learned`);
    console.log(`  Agents : ${coordinator.status().spawned.length} spawned`);
    const req = http.get('http://127.0.0.1:11434/api/tags', (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { console.log(`  Ollama : ${c.green('✓')} ${JSON.parse(d).models?.map(m=>m.name).join(', ')}`); }
        catch { console.log(`  Ollama : responding`); }
        console.log("");
      });
    });
    req.on('error', () => { console.log(`  Ollama : ${c.red('✕ offline')}\n`); });
    req.setTimeout(2000, () => { req.destroy(); console.log(`  Ollama : ...\n`); });
  },

  '/map': () => {
    const mapFile = path.join(process.env.HOME, 'CUTBAR_ECOSYSTEM_MAP.md');
    if (fs.existsSync(mapFile)) {
      console.log(`\n${fs.readFileSync(mapFile, 'utf8').substring(0, 2000)}`);
      console.log(`\n  ... (full: ~/CUTBAR_ECOSYSTEM_MAP.md)`);
    } else { printLine("warn", "No map. Run audits first."); }
    console.log("");
  },

  '/boot': async () => {
    const dna = initPrompt.commit();
  const restored = coordinator.restoreSession();
  if (restored.length) printLine('info', `Restored agents: ${restored.map(r => '@' + r).join(', ')}`);
    printLine("done", `DNA loaded: ${Object.keys(dna.modules || {}).length} modules`);
  },

  '/help': () => {
    console.log(`\n  ${c.green('⬡')} SUPREME COMMANDER\n`);
    console.log(`  ${c.lime('/@ @agent task')} ${c.dim('— Dispatch agent (or auto-detect)')}
    ${c.lime('/mission <name>')} ${c.dim('— Run mission')}
    ${c.lime('/chain @a | @b')} ${c.dim('— Chain agents')}`);
    console.log(`  ${c.lime('/agents')}       ${c.dim('— Agent roster')}`);
    console.log(`  ${c.lime('/audit <path>')}  ${c.dim('— Deep scan + grade')}`);
    console.log(`  ${c.lime('/auto <goal>')}   ${c.dim('— Autonomous mission')}`);
    console.log(`  ${c.lime('/plan <goal>')}  ${c.dim('— Task decomposition')}`);
    console.log(`  ${c.lime('/tags')}         ${c.dim('— Vault tags')}`);
    console.log(`  ${c.lime('/vault #tag')}   ${c.dim('— Query vault')}`);
    console.log(`  ${c.lime('/status')}       ${c.dim('— System health')}`);
    console.log(`  ${c.lime('/skills')}       ${c.dim('— Learned skills')}`);
    console.log(`  ${c.lime('/map')}          ${c.dim('— Ecosystem map')}`);
    console.log(`  ${c.lime('exit')}          ${c.dim('— Shutdown')}`);
    console.log("");
  }
};

async function callAI(input) {
  process.stdout.write(`  ${c.green("⬡")}  `);
  try {
    const reply = await brain.chat([
      { role: "system", content: initPrompt.toSystemPrompt() },
      ...conversationHistory,
      { role: "user", content: input }
    ], chunk => process.stdout.write(c.white(chunk))).catch(() => '');
    console.log("\n");
    conversationHistory.push({ role: "user", content: input }, { role: "assistant", content: reply || "" });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
    fs.appendFileSync("ADMINReadme.md", `\n### [${new Date().toLocaleString()}]\n**User:** ${input}\n**Agent:** ${(reply||'').replace(/\n/g,' ')}\n`);
  } catch (err) { console.log(""); printLine("error", err.message); }
}

async function main() {
  console.clear();
  printBanner();
  initPrompt.commit();
  const restored = coordinator.restoreSession();
  if (restored.length) printLine('info', `Restored agents: ${restored.map(r => '@' + r).join(', ')}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let running = true;
  rl.on('close', () => { running = false; });

  const prompt = () => {
    if (!running) return;
    rl.question(c.green(`\n  ⬡ flock ❯ `), async (input) => {
      if (!input.trim()) { prompt(); return; }
      if (input === "exit" || input === "quit") {
        fs.appendFileSync("ADMINReadme.md", `\n## Session End: ${new Date().toLocaleString()}\n`);
        rl.close(); return;
      }
      const cmd = Object.keys(COMMANDS).find(k => input.startsWith(k));
      if (cmd) {
        await COMMANDS[cmd](input);
      } else {
        // Auto-detect agent for natural language tasks
        const detected = coordinator.autoDetect(input);
        if (detected.length > 0 && detected[0].matchCount >= 1) {
          const best = detected[0];
          console.log(`  ⬡ Auto-routing to @${best.name} ${best.icon}`);
          const results = await coordinator.dispatch(`@${best.name} ${input}`);
          results.forEach(r => {
            const icons = { '@auditor':'🔍', '@builder':'🔧', '@architect':'📐', '@watcher':'👁️', '@vault':'📚' };
            console.log(`  ${icons[r.agent]||'●'} ${r.agent}: ${JSON.stringify(r.result).substring(0, 300)}`);
          });
        } else {
          await callAI(input.trim());
        }
      }
      prompt();
    });
  };
  prompt();
}

main().catch(err => { printLine("error", `Fatal: ${err.message}`); process.exit(1); });
