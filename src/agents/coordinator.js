import { Brain } from './brain.js';
import { Auditor } from './auditor.js';
import { Planner } from './planner.js';
import { Terminal } from '../tools/terminal.js';
import { FileSystem } from '../tools/file-system.js';
import { MemoryEngine } from '../memory/engine.js';
import { ui } from '../tools/terminal-ui.js';
import fs from 'fs';
import path from 'path';

// Agent Registry
const AGENTS = {
  auditor: {
    role: 'Code Auditor',
    icon: '🔍',
    triggers: ['audit', 'scan', 'grade', 'check', 'inspect', 'verify', 'review'],
    tools: ['scan', 'read_file', 'analyze'],
    prompt: 'You are @auditor. Scan codebases, find issues, grade quality. Be terse. Report missing tests, docs, configs.'
  },
  builder: {
    role: 'System Builder',
    icon: '🔧',
    triggers: ['build', 'create', 'write', 'add', 'scaffold', 'generate', 'make', 'compile', 'install', 'deploy', 'new', 'update', 'modify'],
    tools: ['write_file', 'terminal', 'scaffold', 'sed', 'find'],
    prompt: 'You are @builder. Create files, run commands, scaffold modules. Build Web, Mobile (Expo), and Desktop (Electron) apps. Generate working, production-ready code.'
  },
  webmaster: {
    role: 'Web Specialist',
    icon: '🌐',
    triggers: ['web', 'react', 'vite', 'frontend', 'ui', 'css', 'tailwind', 'html'],
    tools: ['scaffold', 'write_file'],
    prompt: 'You are @webmaster. Build high-performance React/Vite apps. Expert in Tailwind and modern UI patterns.'
  },
  mobile: {
    role: 'Mobile Specialist',
    icon: '📱',
    triggers: ['mobile', 'android', 'ios', 'expo', 'react-native', 'app'],
    tools: ['scaffold', 'write_file'],
    prompt: 'You are @mobile. Build React Native/Expo apps for Android and iOS. Focus on mobile-native patterns.'
  },
  architect: {
    role: 'System Architect',
    icon: '📐',
    triggers: ['plan', 'design', 'architect', 'structure', 'blueprint', 'diagram', 'system'],
    tools: ['plan', 'design', 'diagram'],
    prompt: 'You are @architect. Design system structure, plan features, map dependencies. Think before building. Return structured plans.'
  },
  watcher: {
    role: 'File Watcher',
    icon: '👁️',
    triggers: ['watch', 'monitor', 'observe', 'track', 'log', 'report', 'status'],
    tools: ['watch', 'notify', 'log'],
    prompt: 'You are @watcher. Monitor files for changes, alert agents, maintain audit trail. Report on system state.'
  },
  vault: {
    role: 'Knowledge Vault',
    icon: '📚',
    triggers: ['search', 'find', 'query', 'remember', 'recall', 'lookup', 'index', 'knowledge'],
    tools: ['store', 'query', 'index'],
    prompt: 'You are @vault. Store and retrieve knowledge. Index skills, answer queries, maintain the memory. Search all vaults.'
  }
};

export class Coordinator {
  constructor(brain, configPath) {
    this.brain = brain;
    this.configPath = configPath || path.join(process.env.HOME, '.flock');
    this.memory = new MemoryEngine(this.configPath);
    this.fs = new FileSystem();
    this.agents = {};
    this.messageQueue = [];
    this.activeAgents = new Set();
    
    // Load persistent agent memory
    this.agentMemory = this._loadMemory();
    this.missionLog = this._loadMissions();
  }

  /**
   * Auto-detect which agents to spawn based on task keywords
   */
  autoDetect(task) {
    const lower = task.toLowerCase();
    const detected = [];
    
    for (const [name, def] of Object.entries(AGENTS)) {
      const matchCount = def.triggers.filter(t => lower.includes(t)).length;
      if (matchCount > 0) {
        detected.push({ name, matchCount, icon: def.icon });
      }
    }
    
    // Sort by match count, return best matches
    return detected.sort((a, b) => b.matchCount - a.matchCount);
  }

  /**
   * Auto-spawn agents based on task content
   */
  autoSpawn(task) {
    const detected = this.autoDetect(task);
    const spawned = [];
    
    for (const d of detected) {
      if (!this.agents[d.name]) {
        this.spawn(d.name);
        spawned.push(d.name);
      }
    }
    
    return spawned;
  }

  /**
   * Spawn an agent with persistent memory
   */
  spawn(name) {
    const def = AGENTS[name];
    if (!def) return null;
    
    // Load agent's persistent memory
    const memKey = `agent_${name}`;
    const savedMemory = this.agentMemory[memKey] || [];
    
    const agent = {
      name: `@${name}`,
      ...def,
      spawned: new Date().toISOString(),
      memory: savedMemory, // Persistent across sessions
      state: 'idle',
      tasksCompleted: savedMemory.filter(m => m.type === 'task_complete').length
    };
    
    this.agents[name] = agent;
    this.activeAgents.add(name);
    return agent;
  }

  /**
   * Dispatch task to agents with auto-spawn
   */
  async dispatch(input) {
    const mentions = input.match(/@([a-zA-Z_]+)/g);
    let targetAgents = [];
    
    if (mentions) {
      // Explicit mentions — spawn and route
      for (const mention of mentions) {
        const name = mention.replace('@', '');
        if (AGENTS[name]) {
          targetAgents.push(name);
        }
      }
    } else {
      // No mentions — auto-detect
      const detected = this.autoDetect(input);
      if (detected.length > 0) {
        const bestMatch = detected[0];
        targetAgents.push(bestMatch.name);
        console.log(`  ⬡ Auto-detected: @${bestMatch.name} (matched: ${AGENTS[bestMatch.name].triggers.filter(t => input.toLowerCase().includes(t)).join(', ')})`);
      }
    }
    
    if (targetAgents.length === 0) {
      return [{ agent: '@vault', result: { error: 'No agent matched. Try: audit, build, plan, search, watch' } }];
    }

    // Auto-spawn any that aren't active
    const spawned = [];
    for (const name of targetAgents) {
      if (!this.agents[name]) {
        this.spawn(name);
        spawned.push(name);
      }
    }
    if (spawned.length) console.log(`  ⬡ Spawned: ${spawned.map(s => '@' + s).join(', ')}`);

    const results = [];
    const task = input.replace(/@[a-zA-Z_]+/g, '').trim();
    
    for (const name of targetAgents) {
      const agent = this.agents[name];
      agent.state = 'working';
      
      console.log(`\n  ${AGENTS[name].icon} @${name} working...`);
      
      let result;
      switch(name) {
        case 'auditor': result = await this._runAuditor(task); break;
        case 'builder': result = await this._runBuilder(task); break;
        case 'webmaster': result = await this._runWebmaster(task); break;
        case 'mobile': result = await this._runMobile(task); break;
        case 'native': result = await this._runNative(task); break;
        case 'architect': result = await this._runArchitect(task); break;
        case 'watcher': result = await this._runWatcher(task); break;
        case 'vault': result = await this._runVault(task); break;
        default: result = await this._runGeneric(name, task);
      }
      
      agent.state = 'idle';
      agent.tasksCompleted++;
      
      // Store in persistent memory
      agent.memory.push({
        time: new Date().toISOString(),
        type: 'task_complete',
        task: task.substring(0, 200),
        result: result?.action || 'done'
      });
      this._saveAgentMemory(name, agent.memory);
      
      results.push({ agent: `@${name}`, result });
    }

    // Store interaction
    this._storeInteraction(input, results);
    
    return results;
  }

  /**
   * Chain agents — each output feeds the next
   */
  async chain(commands) {
    const outputs = [];
    let context = '';
    
    for (const cmd of commands) {
      // Inject context from previous step
      const enrichedCmd = context ? `${cmd} (context: ${context.substring(0, 300)})` : cmd;
      
      const result = await this.dispatch(enrichedCmd);
      outputs.push(result);
      
      // Build context for next agent
      if (result.length > 0) {
        context = JSON.stringify(result[0].result).substring(0, 500);
      }
    }
    
    // Store chain
    this._storeChain(commands, outputs);
    
    return outputs;
  }

  /**
   * Run a pre-built mission file
   */
  async runMission(missionName) {
    const missions = this._loadMissions();
    const mission = missions[missionName];
    
    if (!mission) {
      console.log(`\n  Available missions:`);
      Object.keys(missions).forEach(m => console.log(`  · ${m}: ${missions[m].description}`));
      return [];
    }
    
    console.log(`\n  ⬡ MISSION: ${mission.name}`);
    console.log(`  · ${mission.description}`);
    console.log(`  · ${mission.steps.length} steps\n`);
    
    const results = [];
    for (let i = 0; i < mission.steps.length; i++) {
      const step = mission.steps[i];
      console.log(`  ── STEP ${i + 1}/${mission.steps.length}: ${step.agent} ──`);
      
      const result = await this.dispatch(`@${step.agent} ${step.task}`);
      results.push({ step: i + 1, agent: step.agent, result });
      
      // Brief pause between steps
      await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`\n  ✓ Mission complete: ${mission.name}\n`);
    return results;
  }

  // ── AGENT IMPLEMENTATIONS ──────────────────────────────────────

  async _runAuditor(task) {
    const target = this._extractPath(task) || '.';
    const auditor = new Auditor(this.brain, this.configPath);
    const report = await auditor.audit(target, { deep: false, verify: true });
    
    this._vaultStore(`audit_${path.basename(target)}_${Date.now().toString(36)}`, {
      type: 'audit', agent: '@auditor', task, target,
      files: report.files?.length, grade: report.verify?.grade, score: report.verify?.score,
      timestamp: new Date().toISOString()
    });
    
    return {
      action: 'audit', target,
      files: report.files?.length,
      grade: report.verify?.grade,
      score: report.verify?.score,
      issues: report.verify?.failed
    };
  }

  async _runBuilder(task) {
    // Extract file path + optional description
    let writeMatch = null;
    // Simple: "build ~/path/file.ext: description" — handles dotfiles, all extensions
    writeMatch = task.match(/(?:write|create|scaffold|build|generate|add|new|make)\s+(?:a\s+|an\s+)?(?:file\s+)?(?:at\s+)?(~\/\S+\.?\w*)\s*:?\s*(.*)/i);
    if (writeMatch && writeMatch[1].endsWith(':')) writeMatch[1] = writeMatch[1].slice(0, -1); // Strip trailing colon
    // Fallback: just "build path" without tilde
    if (!writeMatch) writeMatch = task.match(/(?:write|create|scaffold|build|generate|add|new|make)\s+(?:a\s+|an\s+)?(?:file\s+)?(?:at\s+)?(\/\S+\.?\w*)\s*:?\s*(.*)/i);
    const cmdMatch = task.match(/(?:run|execute|shell)\s+(.+)/i);
    
    if (writeMatch) {
      const [_, filepath, description] = writeMatch;
      const fullPath = path.resolve(filepath.replace(/^~\//, process.env.HOME + '/'));
      
      // Generate file content from templates
      let fileContent = this._generateFromTemplate(fullPath, description, task);
      
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, fileContent);
      console.log(`  ✓ Created: ${fullPath} (${fileContent.length}B)`);
      
      this._vaultStore(`build_${path.basename(fullPath)}`, {
        type: 'build', agent: '@builder', file: fullPath,
        size: fileContent.length, timestamp: new Date().toISOString()
      });
      
      return { action: 'write', path: fullPath, size: fileContent.length, preview: fileContent.substring(0, 200) };
    }
    
    if (cmdMatch) {
      const terminal = new Terminal();
      const output = await terminal.execute(cmdMatch[1]).catch(e => e.message);
      return { action: 'terminal', command: cmdMatch[1], output: output?.substring(0, 500) };
    }
    
    // Generic — return scaffold suggestion
    return { action: 'suggest', files: this._suggestFiles(task), tip: 'Use: build path/to/file.js: description' };
  }
  
  _generateFromTemplate(filepath, description, fullTask) {
    const ext = path.extname(filepath).toLowerCase();
    const name = path.basename(filepath, ext);
    const now = new Date().toISOString();
    
    const templates = {
      '.js': `// ${name}.js — Generated by @builder\n// ${now}\n// ${description || 'Auto-generated module'}\n\nexport class ${this._pascalCase(name)} {\n  constructor() {\n    this.created = '${now}';\n  }\n\n  async run() {\n    return { status: 'ok', module: '${name}' };\n  }\n}\n\nexport default ${this._pascalCase(name)};\n`,
      '.jsx': `// ${name}.jsx — Generated by @builder\n// ${now}\nimport React from 'react';\n\nexport default function ${this._pascalCase(name)}() {\n  return (\n    <div className="${name}">\n      <h1>${description || name}</h1>\n      <p>Generated by CUFIN.FLOCK @builder</p>\n    </div>\n  );\n}\n`,
      '.ts': `// ${name}.ts — Generated by @builder\n// ${now}\n\nexport interface ${this._pascalCase(name)}Config {\n  name: string;\n  version: string;\n}\n\nexport class ${this._pascalCase(name)} {\n  constructor(private config: ${this._pascalCase(name)}Config) {}\n  async execute(): Promise<{ status: string }> {\n    return { status: 'ok' };\n  }\n}\n`,
      '.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${description || name}</title>\n</head>\n<body>\n  <h1>${description || name}</h1>\n  <p>Generated by CUFIN.FLOCK @builder — ${now}</p>\n</body>\n</html>\n`,
      '.md': `# ${description || name}\n\nGenerated by @builder — ${now}\n\n## Overview\n\n${fullTask || 'Auto-generated documentation'}\n\n## Status\n\n- Created: ${now}\n- Agent: @builder\n`,
      '.json': JSON.stringify({ name, description: description || 'Auto-generated', created: now, agent: '@builder', version: '1.0.0' }, null, 2) + '\n',
      '.sh': `#!/bin/bash\n# ${name}.sh — Generated by @builder\n# ${now}\n# ${description || 'Auto-generated script'}\n\necho "${name} — generated by CUFIN.FLOCK @builder"\n`,
      '.py': `# ${name}.py — Generated by @builder\n# ${now}\n# ${description || 'Auto-generated module'}\n\nclass ${this._pascalCase(name)}:\n    def __init__(self):\n        self.created = '${now}'\n    \n    def run(self):\n        return {'status': 'ok', 'module': '${name}'}\n\nif __name__ == '__main__':\n    print(${this._pascalCase(name)}().run())\n`,
    };
    
    if (filepath.endsWith('.gitignore')) return `# Generated by @builder\n# ${now}\n# ${description || 'Auto-generated gitignore'}\n\nnode_modules/\n.flock/\n*.log\n*.pid\n.DS_Store\n`;
    // Handle dotfiles like .gitignore, .env
    if (filepath.endsWith('.gitignore')) return `# Generated by @builder\n# ${now}\n\nnode_modules/\n.flock/\n*.log\n*.pid\n.env\n.DS_Store\n`;
    if (name.startsWith('.')) return `# ${name}\n# Generated by @builder — ${now}\n# ${description || 'Auto-generated'}\n`;

    const template = templates[ext];
    if (template) return template;
    return `# ${name}${ext}\n# Generated by @builder — ${now}\n# ${description || 'Auto-generated'}\n`;
  }
  
  _suggestFiles(task) {
    const suggestions = [];
    if (task.includes('page') || task.includes('ui') || task.includes('dashboard')) suggestions.push('Component.jsx', 'styles.css');
    if (task.includes('api') || task.includes('server') || task.includes('endpoint')) suggestions.push('server.js', 'routes.js');
    if (task.includes('test') || task.includes('spec')) suggestions.push('test.js');
    if (task.includes('config') || task.includes('setup')) suggestions.push('config.json', '.env.example');
    return suggestions.length ? suggestions : ['index.js', 'README.md'];
  }
  
  _pascalCase(str) {
    return str.replace(/[-_](.)/g, (_, c) => c.toUpperCase()).replace(/^./, c => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
  }

  async _runArchitect(task) {
    const planner = new Planner(this.brain, this.memory);
    
    // 8-second timeout — fall back to heuristic
    const plan = await Promise.race([
      planner.decompose(task),
      new Promise(resolve => setTimeout(() => resolve(planner._fallbackPlan(task)), 8000))
    ]);
    
    this._vaultStore(`plan_${Date.now().toString(36)}`, {
      type: 'plan', agent: '@architect', goal: task,
      steps: plan.length, plan, timestamp: new Date().toISOString()
    });
    
    return {
      action: 'plan', steps: plan.length,
      plan: plan.map(s => ({ id: s.id, description: s.description, tool: s.tool }))
    };
  }

  async _runWatcher(task) {
    if (task.includes('watch') || task.includes('monitor')) {
      const target = this._extractPath(task);
      return { action: 'watch', target, status: 'Monitoring active' };
    }
    
    // Report on system state
    const skillsDir = path.join(this.configPath, 'skills');
    const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.json'));
    const recent = files.slice(-5).map(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(skillsDir, f), 'utf8'));
        return { file: f.replace('.json', ''), type: d.type || d.agent || '?', time: d.timestamp || d.audited };
      } catch { return { file: f.replace('.json', ''), type: '?' }; }
    });
    
    const vaultDir = path.join(this.configPath, 'vault');
    const vaultFiles = fs.existsSync(vaultDir) ? fs.readdirSync(vaultDir).length : 0;
    
    return {
      action: 'report',
      skills: files.length,
      vault: vaultFiles,
      agents: Object.keys(this.agents).length,
      recent
    };
  }

  async _runVault(task) {
    const skillsDir = path.join(this.configPath, 'skills');
    const vaultDir = path.join(this.configPath, 'vault');
    
    const searchAll = (dir, query) => {
      const results = [];
      if (!fs.existsSync(dir)) return results;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
          const str = JSON.stringify(data).toLowerCase();
          if (str.includes(query.toLowerCase())) {
            results.push({ source: dir.split('/').pop(), file: file.replace('.json', ''), preview: JSON.stringify(data).substring(0, 200) });
          }
        } catch {}
      }
      return results;
    };
    
    const query = task.replace(/search|find|query|lookup|recall/i, '').trim() || task;
    const results = [...searchAll(skillsDir, query), ...searchAll(vaultDir, query)];
    
    return {
      action: 'search',
      query,
      matches: results.length,
      sources: ['skills', 'vault'],
      results: results.slice(0, 8)
    };
  }

  async _runGeneric(name, task) {
    const def = AGENTS[name];
    const response = await this.brain.chat([
      { role: 'system', content: def?.prompt || `You are @${name}.` },
      { role: 'user', content: task }
    ]).catch(() => `${name} offline`);
    
    return { action: 'respond', response: response?.substring(0, 300) };
  }

  // ── PERSISTENT MEMORY ─────────────────────────────────────────

  _loadMemory() {
    const file = path.join(this.configPath, 'agent_memory.json');
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return {}; }
  }

  _saveMemory() {
    const file = path.join(this.configPath, 'agent_memory.json');
    fs.writeFileSync(file, JSON.stringify(this.agentMemory, null, 2));
  }

  _saveAgentMemory(name, memory) {
    this.agentMemory[`agent_${name}`] = memory.slice(-100); // Keep last 100 entries
    this._saveMemory();
  }

  _loadMissions() {
    const file = path.join(this.configPath, 'missions.json');
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return {}; }
  }

  // ── VAULT OPERATIONS ──────────────────────────────────────────

  _vaultStore(key, data) {
    const dir = path.join(this.configPath, 'vault');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(data, null, 2));
  }

  _storeInteraction(input, results) {
    const dir = path.join(this.configPath, 'messages');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `msg_${Date.now()}.json`), JSON.stringify({
      timestamp: new Date().toISOString(), input,
      agents: results.map(r => r.agent),
      results: results.map(r => ({ agent: r.agent, action: r.result?.action }))
    }, null, 2));
  }

  _storeChain(commands, outputs) {
    const dir = path.join(this.configPath, 'chains');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `chain_${Date.now()}.json`), JSON.stringify({
      timestamp: new Date().toISOString(), commands,
      stages: outputs.length
    }, null, 2));
  }

  _extractPath(text) {
    const match = text.match(/(~\/\S+|\/[^\s]+)/);
    return match ? match[1] : null;
  }

  /**
   * Restore agents from previous session
   */
  restoreSession() {
    const restored = [];
    for (const [key, memory] of Object.entries(this.agentMemory)) {
      const name = key.replace('agent_', '');
      if (AGENTS[name] && memory.length > 0) {
        this.spawn(name);
        restored.push(name);
      }
    }
    return restored;
  }

  /**
   * Get full status
   */
  status() {
    return {
      registered: Object.keys(AGENTS),
      active: [...this.activeAgents],
      spawned: Object.entries(this.agents).map(([name, a]) => ({
        name: `@${name}`, role: a.role, state: a.state,
        memorySize: a.memory.length, tasksCompleted: a.tasksCompleted,
        spawned: a.spawned
      })),
      vaultSize: (() => {
        try { return fs.readdirSync(path.join(this.configPath, 'vault')).length; } catch { return 0; }
      })(),
      messagesSize: (() => {
        try { return fs.readdirSync(path.join(this.configPath, 'messages')).length; } catch { return 0; }
      })()
    };
  }
}
TENT MEMORY ─────────────────────────────────────────

  _loadMemory() {
    const file = path.join(this.configPath, 'agent_memory.json');
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return {}; }
  }

  _saveMemory() {
    const file = path.join(this.configPath, 'agent_memory.json');
    fs.writeFileSync(file, JSON.stringify(this.agentMemory, null, 2));
  }

  _saveAgentMemory(name, memory) {
    this.agentMemory[`agent_${name}`] = memory.slice(-100); // Keep last 100 entries
    this._saveMemory();
  }

  _loadMissions() {
    const file = path.join(this.configPath, 'missions.json');
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return {}; }
  }

  // ── VAULT OPERATIONS ──────────────────────────────────────────

  _vaultStore(key, data) {
    const dir = path.join(this.configPath, 'vault');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(data, null, 2));
  }

  _storeInteraction(input, results) {
    const dir = path.join(this.configPath, 'messages');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `msg_${Date.now()}.json`), JSON.stringify({
      timestamp: new Date().toISOString(), input,
      agents: results.map(r => r.agent),
      results: results.map(r => ({ agent: r.agent, action: r.result?.action }))
    }, null, 2));
  }

  _storeChain(commands, outputs) {
    const dir = path.join(this.configPath, 'chains');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `chain_${Date.now()}.json`), JSON.stringify({
      timestamp: new Date().toISOString(), commands,
      stages: outputs.length
    }, null, 2));
  }

  _extractPath(text) {
    const match = text.match(/(~\/\S+|\/[^\s]+)/);
    return match ? match[1] : null;
  }

  /**
   * Restore agents from previous session
   */
  restoreSession() {
    const restored = [];
    for (const [key, memory] of Object.entries(this.agentMemory)) {
      const name = key.replace('agent_', '');
      if (AGENTS[name] && memory.length > 0) {
        this.spawn(name);
        restored.push(name);
      }
    }
    return restored;
  }

  /**
   * Get full status
   */
  status() {
    return {
      registered: Object.keys(AGENTS),
      active: [...this.activeAgents],
      spawned: Object.entries(this.agents).map(([name, a]) => ({
        name: `@${name}`, role: a.role, state: a.state,
        memorySize: a.memory.length, tasksCompleted: a.tasksCompleted,
        spawned: a.spawned
      })),
      vaultSize: (() => {
        try { return fs.readdirSync(path.join(this.configPath, 'vault')).length; } catch { return 0; }
      })(),
      messagesSize: (() => {
        try { return fs.readdirSync(path.join(this.configPath, 'messages')).length; } catch { return 0; }
      })()
    };
  }
}
