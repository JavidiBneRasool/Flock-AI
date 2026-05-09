#!/usr/bin/env node
import { Auditor } from '../src/agents/auditor.js';

import { Brain } from "../src/agents/brain.js";
import { Planner } from "../src/agents/planner.js";
import { AutonomousLoop } from "../src/agents/autonomous.js";
import { MemoryEngine } from "../src/memory/engine.js";
import { InitPrompt } from "../src/memory/init-prompt.js";
import readline from "readline";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const CONFIG_PATH = path.join(process.env.HOME, ".flock");
const CONFIG_FILE = path.join(CONFIG_PATH, "config.json");

// ── SETUP ─────────────────────────────────────────────────────────────────
if (!fs.existsSync(CONFIG_PATH)) fs.mkdirSync(CONFIG_PATH, { recursive: true });
if (!fs.existsSync(path.join(CONFIG_PATH, 'skills'))) fs.mkdirSync(path.join(CONFIG_PATH, 'skills'));

const loadJSON = (file, def) => { try { return JSON.parse(fs.readFileSync(file)); } catch { return def; } };
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

let config = loadJSON(CONFIG_FILE, { agent: "local", model: "deepseek-r1:1.5b" });
detectModel();
saveJSON(CONFIG_FILE, config);

const brain = new Brain(config.model);
const memory = new MemoryEngine(CONFIG_PATH);
const planner = new Planner(brain, memory);
const initPrompt = new InitPrompt(CONFIG_PATH);
const autonomous = new AutonomousLoop(config.model);

let conversationHistory = [];

// ── COLORS ────────────────────────────────────────────────────────────────
const c = {
  green: (t) => chalk.hex("#4ade80")(t),
  orange: (t) => chalk.hex("#f97316")(t),
  blue: (t) => chalk.hex("#3b82f6")(t),
  dim: (t) => chalk.hex("#475569")(t),
  red: (t) => chalk.hex("#ef4444")(t),
  yellow: (t) => chalk.hex("#fbbf24")(t),
  white: (t) => chalk.hex("#e2e8f0")(t),
  lime: (t) => chalk.hex("#a3e635")(t),
};

function printLine(type, text) {
  const icons = { info: c.dim("·"), done: c.green("✓"), warn: c.yellow("⚠"), error: c.red("✕"), ai: c.green("⬡") };
  const colors = { info: c.dim, done: c.green, warn: c.yellow, error: c.red, ai: c.white };
  const icon = icons[type] || icons.info;
  const colorFn = colors[type] || c.white;
  console.log(`  ${icon}  ${colorFn(text)}`);
}

// ── MODEL AUTO-DETECTION ──────────────────────────────────────────────────
function detectModel() {
  const PREFERRED = ['deepseek-r1:1.5b', 'deepseek-r1', 'qwen3.5', 'llama3.2', 'llama3'];
  try {
    const list = execSync('ollama list 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
    for (const preferred of PREFERRED) {
      if (list.includes(preferred)) {
        config.model = preferred;
        return;
      }
    }
  } catch(e) {}
}

// ── BANNER ────────────────────────────────────────────────────────────────
function printBanner() {
  console.log("");
  console.log(c.green("  ╔═══════════════════════════════╗"));
  console.log(c.green("  ║  ") + c.lime("CUFIN") + c.green(".") + c.orange("FLOCK") + c.green("  ") + c.dim("v1.1.0 (LOCAL)  ") + c.green("║"));
  console.log(c.green("  ║  ") + c.dim("Autonomous AI OS Loop       ") + c.green("║"));
  console.log(c.green("  ╚═══════════════════════════════╝"));
  console.log("");
  printLine("info", `Engine: ${c.green("⬡ LOCAL")} (${config.model})`);
  printLine("info", `Memory: ${memory.getSkills().length} skills learned`);
  printLine("info", `Modules: brain, planner, autonomous, terminal`);
  console.log("");
}

// ── COMMANDS ──────────────────────────────────────────────────────────────
const COMMANDS = {
  '/plan': async (input) => {
    const goal = input.replace('/plan', '').trim();
    if (!goal) {
      printLine("warn", "Usage: /plan <your goal>");
      return;
    }
    const plan = await planner.decompose(goal);
    console.log(`\n  ⬡ Plan for: ${goal}\n`);
    plan.forEach(s => {
      console.log(`  ${c.green(s.id + '.')} ${s.description}`);
      console.log(`     ${c.dim('tool:')} ${s.tool} ${c.dim('→')} ${s.command?.substring(0, 50) || ''}`);
    });
    console.log("");
  },

  '/auto': async (input) => {
    const goal = input.replace('/auto', '').trim();
    if (!goal) {
      printLine("warn", "Usage: /auto <your goal>");
      return;
    }
    await autonomous.run(goal);
  },

  '/boot': async () => {
    const dna = initPrompt.commit();
    const sysPrompt = initPrompt.toSystemPrompt();
    printLine("done", "Project DNA booted into memory");
    printLine("info", `Modules: ${Object.keys(dna.modules || {}).join(', ')}`);
    printLine("info", `Skills: ${dna.skillsCount || 0}`);
    printLine("info", "Init prompt ready for autonomous mode");
    return sysPrompt;
  },

  '/skills': () => {
    const skills = initPrompt._listSkills();
    if (skills.length === 0) {
      printLine("info", "No skills learned yet. Use /auto to build skills.");
      return;
    }
    console.log(`\n  ⬡ Learned Skills (${skills.length}):\n`);
    skills.forEach(s => {
      console.log(`  ${c.green('●')} ${s.name}`);
    });
    console.log("");
  },

  '/audit': () => {
    try {
      const audit = fs.readFileSync('ADMINReadme.md', 'utf8');
      const lines = audit.split('\n').slice(-20);
      console.log(`\n  ⬡ Recent Audit Trail:\n`);
      lines.forEach(l => console.log(`  ${c.dim(l)}`));
      console.log("");
    } catch {
      printLine("warn", "No audit log found");
    }
  },

  '/help': () => {
    console.log(`\n  ${c.green('⬡')} FLOCK Commands:\n`);
    console.log(`  ${c.lime('/plan <goal>')}  ${c.dim('— Decompose goal into subtasks')}`);
    console.log(`  ${c.lime('/auto <goal>')}  ${c.dim('— Run full autonomous loop')}`);
    console.log(`  ${c.lime('/boot')}        ${c.dim('— Initialize project DNA into memory')}`);
    console.log(`  ${c.lime('/skills')}      ${c.dim('— List learned skills')}`);
    console.log(`  ${c.lime('/audit')}      ${c.dim('— View recent audit trail')}`);
    console.log(`  ${c.lime('/help')}       ${c.dim('— Show this help')}`);
    console.log(`  ${c.lime('exit')}        ${c.dim('— Shut down engine')}`);
    console.log("");
  }
};

// ── AI CALL ───────────────────────────────────────────────────────────────
async function callAI(input) {
  const dna = memory.loadProjectDNA();
  const systemPrompt = initPrompt.toSystemPrompt();

  process.stdout.write(`  ${c.green("⬡")}  `);

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: input }
    ];

    const reply = await brain.chat(messages, (chunk) => {
      process.stdout.write(c.white(chunk));
    }).catch(() => '');

    console.log("\n");
    conversationHistory.push({ role: "user", content: input });
    conversationHistory.push({ role: "assistant", content: reply || "[No response]" });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);

    const historyEntry = `\n### [${new Date().toLocaleString()}]\n**User:** ${input}\n**Agent:** ${(reply || '').replace(/\n/g, ' ')}\n`;
    fs.appendFileSync("ADMINReadme.md", historyEntry);

  } catch (err) {
    console.log("");
    printLine("error", `Brain error: ${err.message}`);
    printLine("info", "Check: ollama serve");
  }
}

// ── MAIN LOOP ─────────────────────────────────────────────────────────────
async function main() {
  console.clear();
  printBanner();

  // Auto-boot project DNA on startup
  const dna = initPrompt.commit();
  printLine("done", `DNA booted: ${Object.keys(dna.modules || {}).length} modules active`);
  
  const skills = memory.getSkills();
  if (skills.length > 0) {
    printLine("info", `Skills loaded: ${skills.join(', ')}`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(c.green(`\n  ⬡ flock ❯ `), async (input) => {
      if (!input.trim()) { prompt(); return; }
      
      if (input === "exit" || input === "quit") {
        printLine("info", "Shutting down engine. Logging session...");
        fs.appendFileSync("ADMINReadme.md", `\n## Session End: ${new Date().toLocaleString()}\n`);
        rl.close();
        process.exit(0);
      }

      // Check for slash commands
      const cmdKey = Object.keys(COMMANDS).find(cmd => input.startsWith(cmd));
      if (cmdKey) {
        await COMMANDS[cmdKey](input);
      } else {
        await callAI(input.trim());
      }
      
      prompt();
    });
  };

  prompt();
}

main().catch(err => {
  printLine("error", `Fatal: ${err.message}`);
  process.exit(1);
});
