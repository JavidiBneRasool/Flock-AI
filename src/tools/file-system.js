import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Advanced File System Tool for agents
 * Supports recursive operations, pattern matching, and bulk edits
 */
export class FileSystem {
  /**
   * Recursive search for files matching a pattern
   */
  async find(targetDir, pattern) {
    try {
      const cmd = `find "${targetDir}" -name "${pattern}" -not -path "*/node_modules/*" -not -path "*/.*"`;
      const output = execSync(cmd, { encoding: 'utf8' });
      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Search and replace content across multiple files
   */
  async sed(pattern, replacement, include = "*.js") {
    try {
      // Use grep to find files first to be efficient
      const findCmd = `grep -lR "${pattern}" . --include="${include}" --exclude-dir=node_modules --exclude-dir=.*`;
      const files = execSync(findCmd, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      
      const results = [];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes(pattern)) {
          const newContent = content.split(pattern).join(replacement);
          fs.writeFileSync(file, newContent);
          results.push({ file, status: 'updated' });
        }
      }
      return results;
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Bulk write multiple files (scaffolding)
   */
  async scaffold(baseDir, files) {
    const created = [];
    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = path.join(baseDir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
      created.push(fullPath);
    }
    return created;
  }

  /**
   * Read directory structure as a clean tree
   */
  tree(dir, depth = 2) {
    const walk = (d, curDepth) => {
      if (curDepth > depth) return null;
      const res = {};
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        if (e.isDirectory()) {
          res[e.name + '/'] = walk(path.join(d, e.name), curDepth + 1);
        } else {
          res[e.name] = null;
        }
      }
      return res;
    };
    return walk(dir, 0);
  }
}
