import { Brain } from './brain.js';
import { Auditor } from './auditor.js';
import { ui } from '../tools/terminal-ui.js';
import fs from 'fs';
import path from 'path';

export class Consultant {
  constructor(brain, configPath) {
    this.brain = brain;
    this.configPath = configPath || path.join(process.env.HOME, '.flock');
    this.auditor = new Auditor(this.brain, this.configPath);
  }

  /**
   * Proactively analyze the project and suggest improvements
   */
  async suggest(targetPath = '.') {
    let resolved = targetPath;
    if (resolved.startsWith('~')) resolved = path.join(process.env.HOME, resolved.slice(1));
    resolved = path.resolve(resolved);

    ui.start(`Loading codebase: ${path.basename(resolved)}`);

    // 1. Get raw technical data from Auditor
    const auditData = await this.auditor.audit(resolved, { deep: false, verify: true });
    
    ui.step('Thinking: Architecting improvements');

    // 2. Synthesize suggestions using the Brain
    const context = {
      project: path.basename(resolved),
      filesCount: auditData.files.length,
      grade: auditData.verify?.grade,
      failedChecks: auditData.verify?.failed,
      keyFiles: Object.keys(auditData.keyFiles)
    };

    const prompt = `You are @consultant, a proactive AI architect. 
Analyze this project context and suggest 3 HIGH-IMPACT technical improvements.
Focus on: Architecture, Multi-Platform readiness (Web/Mobile), and Developer Experience.
Be unvarnished and technical. No fluff.

Context: ${JSON.stringify(context)}

Return JSON: {"suggestions": [{"area": "string", "issue": "string", "fix": "string", "impact": "High/Med"}]}`;

    try {
      ui.step('Processing: Finalizing recommendations');
      
      const resp = await this.brain.chat([
        { role: 'system', content: 'You are a senior technical consultant. Return ONLY JSON.' },
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = resp.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        ui.stop('Analysis Complete');
        this._printSuggestions(parsed.suggestions);
        return parsed.suggestions;
      }
    } catch (err) {
      ui.error(`Consultant analysis failed: ${err.message}`);
      return [];
    }
  }

  _printSuggestions(suggestions) {
    console.log(`\n  🚀 PROACTIVE RECOMMENDATIONS:\n`);
    suggestions.forEach((s, i) => {
      console.log(`  ${i + 1}. [${s.area}] ${s.impact} Impact`);
      console.log(`     🚨 Issue : ${s.issue}`);
      console.log(`     💡 Fix   : ${s.fix}\n`);
    });
  }
}
