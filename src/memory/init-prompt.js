import fs from 'fs';
import path from 'path';

export class InitPrompt {
  constructor(configPath) {
    this.configPath = configPath || path.join(process.env.HOME, '.flock');
  }

  /**
   * Generate the full initialization context for the agent
   * This primes all three memory tiers (RAM, DNA, Skills)
   */
  generate() {
    const projectDNA = this._loadJSON('project.json', {});
    const skills = this._listSkills();
    const auditLog = this._getRecentAudit();

    return {
      agent: {
        name: 'CUFIN.FLOCK',
        version: '1.1.0',
        mode: 'LOCAL',
        model: this._loadJSON('config.json', {}).model || 'deepseek-r1:1.5b'
      },

      memory: {
        ram: {
          active_session: true,
          conversation_state: 'initialized',
          session_start: new Date().toISOString(),
          context: {
            last_audit_entry: auditLog.lastEntry,
            skills_available: skills.length
          }
        },

        project_dna: {
          name: 'CUFIN.FLOCK',
          type: 'Autonomous AI OS Loop',
          architecture: 'local-first, Ollama-powered',
          stack: {
            runtime: 'Node.js',
            ai_backend: 'Ollama (deepseek-r1:1.5b, qwen3.5, llama3.2)',
            storage: '.flock/ directory',
            cli: 'bin/flock.js'
          },
          modules: {
            brain: 'src/agents/brain.js',
            memory: 'src/memory/engine.js',
            terminal: 'src/tools/terminal.js',
            planner: 'src/agents/planner.js',
            autonomous: 'src/agents/autonomous.js'
          },
          rules: projectDNA.rules || [
            'Always log actions to ADMINReadme.md',
            'Operate offline-first, no cloud dependencies',
            'Maintain audit trail of all interactions',
            'Use Think → Execute → Observe pattern',
            'Store learned solutions in .flock/skills/'
          ],
          current_plan: projectDNA.currentPlan || null
        },

        skills_library: {
          path: '.flock/skills/',
          count: skills.length,
          list: skills.map(s => s.name)
        }
      },

      audit: {
        log_file: 'ADMINReadme.md',
        recent_entries: auditLog.entries,
        total_sessions: auditLog.sessionCount
      },

      tools: [
        { name: 'terminal', path: 'src/tools/terminal.js', function: 'Execute shell commands' },
        { name: 'planner', path: 'src/agents/planner.js', function: 'Multi-step task decomposition' },
        { name: 'brain', path: 'src/agents/brain.js', function: 'AI reasoning and generation' }
      ],

      instruction: [
        'You are CUFIN.FLOCK, a local-first autonomous AI operating system.',
        'Use the Think → Execute → Observe loop pattern for all actions.',
        'Log every significant action to ADMINReadme.md.',
        'You are running locally with full privacy.',
        'Decompose complex goals using the Planner before execution.',
        'Store reusable solutions as skills in .flock/skills/.'
      ].join(' ')
    };
  }

  /**
   * Format the init context as a system prompt string
   */
  toSystemPrompt() {
    const ctx = this.generate();
    return `[FLOCK INIT CONTEXT]
Agent: ${ctx.agent.name} v${ctx.agent.version} (${ctx.agent.mode})
Model: ${ctx.agent.model}
Session: ${ctx.memory.ram.session_start}

Project: ${ctx.memory.project_dna.name}
Stack: ${ctx.memory.project_dna.stack.runtime}, Ollama
Modules Active: ${Object.keys(ctx.memory.project_dna.modules).join(', ')}
Skills Learned: ${ctx.memory.skills_library.count}

Rules:
${ctx.memory.project_dna.rules.map((r, i) => `${i+1}. ${r}`).join('\n')}

${ctx.instruction}`;
  }

  /**
   * Save the current init context as the active project DNA
   */
  commit() {
    const ctx = this.generate();
    const projectFile = path.join(this.configPath, 'project.json');
    const existing = this._loadJSON('project.json', {});

    const updated = {
      ...existing,
      lastInit: new Date().toISOString(),
      agentConfig: ctx.agent,
      modules: ctx.memory.project_dna.modules,
      rules: ctx.memory.project_dna.rules,
      skillsCount: ctx.memory.skills_library.count
    };

    fs.writeFileSync(projectFile, JSON.stringify(updated, null, 2));
    return updated;
  }

  // ── Private Helpers ─────────────────────────────────────────────────
  _loadJSON(filename, def) {
    const filepath = path.join(this.configPath, filename);
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch {
      return def;
    }
  }

  _listSkills() {
    const skillsDir = path.join(this.configPath, 'skills');
    try {
      const files = fs.readdirSync(skillsDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const skill = this._loadJSON(path.join('skills', f), {});
          return { name: f.replace('.json', ''), ...skill };
        });
    } catch {
      return [];
    }
  }

  _getRecentAudit() {
    try {
      const audit = fs.readFileSync('ADMINReadme.md', 'utf8');
      const entries = audit.split('\n## ').slice(-3);
      const sessions = (audit.match(/## Session/g) || []).length;
      
      return {
        entries: entries.map(e => e.substring(0, 120) + '...'),
        lastEntry: entries[entries.length - 1]?.substring(0, 100) || 'No entries',
        sessionCount: sessions
      };
    } catch {
      return { entries: [], lastEntry: 'No audit log', sessionCount: 0 };
    }
  }
}
