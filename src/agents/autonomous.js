import { Brain } from './brain.js';
import { Planner } from './planner.js';
import { Terminal } from '../tools/terminal.js';
import { MemoryEngine } from '../memory/engine.js';
import { InitPrompt } from '../memory/init-prompt.js';
import { ui } from '../tools/terminal-ui.js';
import fs from 'fs';

export class AutonomousLoop {
  constructor(model = 'deepseek-r1:1.5b') {
    this.brain = new Brain(model);
    this.planner = new Planner(this.brain);
    this.terminal = new Terminal();
    this.memory = new MemoryEngine(process.env.HOME + '/.flock');
    this.initPrompt = new InitPrompt();
    
    this.state = 'idle'; // idle | planning | executing | observing | learning
    this.currentGoal = null;
    this.plan = null;
    this.results = [];
    this.iterationCount = 0;
    this.maxIterations = 50;
  }

  /**
   * Initialize the agent with full project context
   */
  async boot() {
    console.log('\n  ⬡ BOOTING AUTONOMOUS MODE');
    console.log('  · Loading project DNA...');
    
    const dna = this.initPrompt.commit();
    const systemPrompt = this.initPrompt.toSystemPrompt();
    
    console.log(`  · DNA loaded: ${Object.keys(dna.modules || {}).length} modules`);
    console.log(`  · Skills: ${dna.skillsCount || 0} learned`);
    console.log(`  · Rules: ${(dna.rules || []).length} active`);
    console.log('  ✓ Boot complete. Ready for autonomous operation.\n');
    
    return systemPrompt;
  }

  /**
   * Main autonomous loop - Think → Plan → Execute → Observe → Learn
   */
  async run(goal) {
    this.state = 'planning';
    this.currentGoal = goal;
    this.results = [];
    
    console.log(`\n  ⬡ GOD MODE ACTIVE`);
    console.log(`  · Goal: ${goal}\n`);

    // Phase 1: PLAN
    ui.start('PHASE 1: PLANNING');
    const systemPrompt = await this.boot();
    
    try {
      this.plan = await this.planner.decompose(goal);
    } catch (err) {
      ui.step('Fallback plan activated');
      this.plan = this.planner._fallbackPlan(goal);
    }
    
    ui.stop(`Plan created: ${this.plan.length} steps`);
    this.plan.forEach((s, i) => {
      console.log(`    ${i+1}. ${s.description}`);
    });
    console.log('');

    // Phase 2: EXECUTE
    ui.start('PHASE 2: EXECUTION');
    this.state = 'executing';
    
    const executor = async (step) => {
      this.iterationCount++;
      
      if (this.iterationCount > this.maxIterations) {
        throw new Error('Max iterations reached');
      }

      switch(step.tool) {
        case 'terminal':
          return await this.terminal.execute(step.command);
        case 'brain':
          return await this.brain.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: step.command }
          ]);
        case 'write_file':
          // Parse command for file operations
          return await this._handleFileOperation(step.command);
        default:
          return `Unknown tool: ${step.tool}`;
      }
    };

    const onProgress = (event) => {
      if (event.type === 'step_start') {
        console.log(`  · Step ${event.step.id}: ${event.step.description}`);
        process.stdout.write(`    `);
      } else if (event.type === 'step_complete') {
        let output = '';
        if (typeof event.result === 'object') {
          output = JSON.stringify(event.result).substring(0, 100);
        } else {
          output = String(event.result || '').substring(0, 100);
        }
        console.log(`    ✓ ${output.replace(/\n/g, ' ')}...`);
      } else if (event.type === 'step_failed') {
        console.log(`    ✕ Failed: ${event.error}`);
      }
    };

    this.results = await this.planner.execute(this.plan, executor, onProgress);
    ui.stop('Execution complete');

    // Phase 3: OBSERVE
    ui.start('PHASE 3: OBSERVATION');
    this.state = 'observing';
    
    const summary = this.planner.summarize(
      { goal: this.currentGoal, subtasks: this.plan },
      this.results
    );

    ui.stop(`Success: ${summary.success ? 'YES' : 'NO'}`);

    // Phase 4: LEARN
    ui.start('PHASE 4: LEARNING');
    this.state = 'learning';
    
    if (summary.success) {
      await this._learnFromSuccess(goal, this.plan, this.results);
    } else {
      await this._learnFromFailure(goal, summary);
    }
    ui.stop('Learning complete');

    // Log to audit
    this._auditLog(goal, summary);
    
    this.state = 'idle';
    console.log('  ⬡ GOD MODE COMPLETE\n');
    
    return summary;
  }

  /**
   * Continuous autonomous mode - runs until interrupted
   */
  async continuous(goalGenerator) {
    console.log('\n  ⬡ CONTINUOUS AUTONOMOUS MODE');
    console.log('  · Press Ctrl+C to stop\n');

    let goal = typeof goalGenerator === 'function' 
      ? await goalGenerator() 
      : goalGenerator;

    while (this.state !== 'stopped') {
      if (!goal) {
        // Idle - wait for next task
        console.log('  · Idle — waiting for next goal...');
        await this._sleep(5000);
        
        if (typeof goalGenerator === 'function') {
          goal = await goalGenerator();
        }
        continue;
      }

      await this.run(goal);
      
      // Generate next goal
      if (typeof goalGenerator === 'function') {
        goal = await goalGenerator();
      } else {
        goal = null;
      }
    }
  }

  stop() {
    this.state = 'stopped';
    console.log('\n  ⬡ Autonomous mode stopped.');
  }

  // ── Private Methods ──────────────────────────────────────────────────
  async _handleFileOperation(command) {
    // Parse simple file operations from natural language commands
    try {
      // Check if it's a file write
      if (command.includes('write') || command.includes('create')) {
        const parts = command.split('|');
        const filepath = parts[0].trim();
        const content = parts.slice(1).join('|').trim();
        fs.writeFileSync(filepath, content);
        return `File written: ${filepath}`;
      }
      return `File operation: ${command}`;
    } catch (err) {
      throw new Error(`File operation failed: ${err.message}`);
    }
  }

  async _learnFromSuccess(goal, plan, results) {
    const skillName = goal.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const skill = {
      goal,
      plan: plan.map(s => ({ id: s.id, description: s.description, tool: s.tool })),
      results: results.map(r => ({ id: r.id, status: r.status })),
      timestamp: new Date().toISOString()
    };

    try {
      const skillPath = `${process.env.HOME}/.flock/skills/${skillName}.json`;
      fs.writeFileSync(skillPath, JSON.stringify(skill, null, 2));
      console.log(`  · Skill saved: ${skillName}`);
    } catch (err) {
      console.log(`  ⚠  Failed to save skill: ${err.message}`);
    }
  }

  async _learnFromFailure(goal, summary) {
    const failedSteps = summary.results.filter(r => r.status === 'failed');
    console.log(`  · Analyzing ${failedSteps.length} failures...`);
    
    // Store failure patterns for future avoidance
    const failureLog = {
      goal,
      failures: failedSteps,
      timestamp: new Date().toISOString()
    };

    try {
      fs.appendFileSync(
        `${process.env.HOME}/.flock/failures.log`,
        JSON.stringify(failureLog) + '\n'
      );
    } catch {}
  }

  _auditLog(goal, summary) {
    const entry = `\n## [${new Date().toLocaleString()}]\n` +
      `- **Autonomous Run**: ${goal}\n` +
      `- **Result**: ${summary.completed}/${summary.total} completed, ${summary.failed} failed\n` +
      `- **Status**: ${summary.success ? 'Success' : 'Partial Failure'}\n`;
    
    try {
      fs.appendFileSync('ADMINReadme.md', entry);
    } catch {}
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
