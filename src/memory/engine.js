import fs from 'fs';
import path from 'path';

export class MemoryEngine {
  constructor(configPath) {
    this.configPath = configPath;
    this.projectMemoryPath = path.join(configPath, 'project.json');
    this.skillsPath = path.join(configPath, 'skills');
    
    if (!fs.existsSync(this.skillsPath)) {
      fs.mkdirSync(this.skillsPath, { recursive: true });
    }
  }

  loadProjectDNA() {
    try {
      return JSON.parse(fs.readFileSync(this.projectMemoryPath, 'utf8'));
    } catch {
      return {
        name: "Unknown",
        stack: [],
        rules: [],
        dna: "Empty"
      };
    }
  }

  saveProjectDNA(dna) {
    fs.writeFileSync(this.projectMemoryPath, JSON.stringify(dna, null, 2));
  }

  saveSkill(name, solution) {
    const filename = `${name.toLowerCase().replace(/\s+/g, '_')}.md`;
    const content = `# Skill: ${name}\n\n## Solution\n${solution}\n\nGenerated: ${new Date().toISOString()}`;
    fs.writeFileSync(path.join(this.skillsPath, filename), content);
  }

  getSkills() {
    try {
      return fs.readdirSync(this.skillsPath).map(f => f.replace('.md', ''));
    } catch {
      return [];
    }
  }
}
