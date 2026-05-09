import { Brain } from './brain.js';
import { Coordinator } from './coordinator.js';
import { AutonomousLoop } from './autonomous.js';
import { Auditor } from './auditor.js';
import { ui } from '../tools/terminal-ui.js';
import fs from 'fs';
import path from 'path';

export class Phoenix {
  constructor(model = 'deepseek-r1:1.5b') {
    this.configPath = path.join(process.env.HOME, '.flock');
    this.brain = new Brain(model);
    this.coordinator = new Coordinator(this.brain, this.configPath);
    this.autonomous = new AutonomousLoop(model);
    this.isEvolving = false;
    this.evolutionLevel = this._loadEvolutionLevel();
    this.lastHeartbeat = Date.now();
  }

  /**
   * Start the evolution heartbeat
   */
  async start() {
    console.log(`\n  🔥 PHOENIX ENGINE ACTIVATED (Level ${this.evolutionLevel})`);
    console.log(`  · Heartbeat started: ${new Date().toLocaleTimeString()}\n`);

    // Initial scan
    await this.heartbeat();

    // Set interval for continuous evolution (every 5 minutes)
    setInterval(() => this.heartbeat(), 5 * 60 * 1000);
  }

  /**
   * The core heartbeat cycle
   */
  async heartbeat() {
    if (this.isEvolving) return;
    this.isEvolving = true;
    this.lastHeartbeat = Date.now();

    try {
      ui.start('Phoenix: Evolution Heartbeat Active');
      
      // 1. Proactive Knowledge Feeding
      ui.step('Feeding: Analyzing logs for skills');
      await this._feedOnLogs();

      // 2. Self-Audit & Self-Correction
      if (Math.random() > 0.7) { 
        ui.step('Evolution: Triggering recursive self-audit');
        await this._selfUpgrade();
      }

      // 3. Update Visual Style based on Evolution
      ui.step('Styling: Adapting visual theme');
      this._evolveStyle();

      ui.stop('Heartbeat Pulse Complete');

    } catch (err) {
      ui.error(`Phoenix Heartbeat Error: ${err.message}`);
    } finally {
      this.isEvolving = false;
    }
  }

  /**
   * Sniff logs and CLI history to learn new skills automatically
   */
  async _feedOnLogs() {
    const executedLog = path.join(process.env.HOME, 'flock-cli', 'executed.log');
    if (!fs.existsSync(executedLog)) return;

    // Simple pattern matching for successful repeated commands
    const content = fs.readFileSync(executedLog, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    
    // Count command frequency
    const freq = {};
    lines.slice(-100).forEach(l => freq[l] = (freq[l] || 0) + 1);

    const repeaters = Object.entries(freq).filter(([cmd, count]) => count >= 3);
    
    for (const [cmd, count] of repeaters) {
      const skillName = `auto_skill_${cmd.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}`;
      const skillPath = path.join(this.configPath, 'skills', `${skillName}.json`);
      
      if (!fs.existsSync(skillPath)) {
        console.log(`  ✨ New Skill Gained: ${cmd}`);
        const skill = {
          name: skillName,
          trigger: cmd,
          type: 'auto_learned',
          timestamp: new Date().toISOString(),
          usageCount: count
        };
        fs.writeFileSync(skillPath, JSON.stringify(skill, null, 2));
      }
    }
  }

  /**
   * Perform a self-audit and apply improvements to flock-cli
   */
  async _selfUpgrade() {
    console.log(`  🔥 Phoenix: Triggering Self-Evolution Cycle...`);
    const auditor = new Auditor(this.brain, this.configPath);
    const selfPath = path.join(process.env.HOME, 'flock-cli');
    
    const report = await auditor.audit(selfPath, { deep: true, verify: true });
    
    if (report.verify && report.verify.grade !== 'A') {
      const issue = report.verify.failed[0] || 'general improvement';
      console.log(`  ⚡ Self-Correction: Improving codebase (${issue})...`);
      
      // Task @builder to fix a missing file or improve structure
      const mission = `Improve codebase addressing ${issue}`;
      await this.coordinator.dispatch(`@builder ${mission}`);
      
      this.evolutionLevel++;
      this._saveEvolutionLevel();
    }
  }

  /**
   * Update the internal style preferences of the agent
   */
  _evolveStyle() {
    const themes = ['classic', 'neon', 'matrix', 'sunset', 'arctic'];
    const currentTheme = themes[this.evolutionLevel % themes.length];
    
    const stylePath = path.join(this.configPath, 'phoenix_style.json');
    fs.writeFileSync(stylePath, JSON.stringify({
      theme: currentTheme,
      evolutionLevel: this.evolutionLevel,
      lastEvolved: new Date().toISOString()
    }, null, 2));
  }

  _loadEvolutionLevel() {
    const p = path.join(this.configPath, 'evolution.json');
    try { return JSON.parse(fs.readFileSync(p, 'utf8')).level; }
    catch { return 1; }
  }

  _saveEvolutionLevel() {
    const p = path.join(this.configPath, 'evolution.json');
    fs.writeFileSync(p, JSON.stringify({ level: this.evolutionLevel }));
  }
}
