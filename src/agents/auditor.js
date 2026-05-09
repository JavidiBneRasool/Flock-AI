import { Brain } from './brain.js';
import { MemoryEngine } from '../memory/engine.js';
import { ui } from '../tools/terminal-ui.js';
import fs from 'fs';
import path from 'path';

const SPINNER = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

export class Auditor {
  constructor(brain, configPath) {
    this.brain = brain;
    this.memory = new MemoryEngine(configPath || process.env.HOME + '/.flock');
  }

  async audit(target, options = {}) {
    const opts = { deep: true, online: false, verify: true, ...options };
    
    let resolved = target;
    if (resolved.startsWith('~')) resolved = path.join(process.env.HOME, resolved.slice(1));
    resolved = path.resolve(resolved);

    console.log(`\n  ⬡ AUDIT ENGAGED`);
    console.log(`  ┝ ${resolved}`);
    console.log(`  ┕ ${opts.deep ? 'DEEP' : 'QUICK'} scan · verify: ${opts.verify ? 'ON' : 'OFF'}\n`);

    if (!fs.existsSync(resolved)) {
      console.log(`  ✕ Path not found\n`);
      return { error: 'not_found' };
    }

    const stat = fs.statSync(resolved);
    const report = {
      target, resolved, timestamp: new Date().toISOString(),
      isDirectory: stat.isDirectory(), totalSize: 0, files: [], dirs: [], keyFiles: {}
    };

    // ═══ SCAN ═══
    ui.start('Scanning structure');
    if (stat.isDirectory()) {
      await this._liveWalk(resolved, report, opts.deep ? 10 : 2, 0);
    } else {
      report.files.push({ path: resolved, size: stat.size, ext: path.extname(resolved) });
      report.totalSize = stat.size;
    }
    ui.stop(`Scanned: ${report.files.length} files · ${this._fmt(report.totalSize)}`);

    // ═══ READ KEY FILES ═══
    console.log(`  ═══ KEY FILES ═══`);
    await this._readKeyFiles(report);

    // ═══ QUICK ANALYSIS (always fast) ═══
    const heuristics = this._quickAnalyze(report);

    // ═══ AI ANALYSIS (only if deep, with strict timeout) ═══
    if (opts.deep && !opts.online) {
      ui.start('AI analysis');
      report.aiAnalysis = await this._aiAnalyze(report, heuristics);
      if (report.aiAnalysis) {
        ui.stop('AI analysis complete');
      } else {
        ui.step('Skipped AI analysis');
      }
    } else {
      report.aiAnalysis = { purpose: `${heuristics.projectType} project`, quality: 5, risks: [], recommendation: '' };
    }

    // ═══ VERIFY ═══
    if (opts.verify) {
      console.log(`  ═══ INTEGRITY CHECK ═══`);
      report.verify = await this._verify(report);
    }

    // ═══ STORE & REPORT ═══
    await this._store(report);
    this._printReport(report, heuristics);
    return report;
  }

  _spinner(label) {
    let i = 0;
    const icons = ['◌','◍','◎','●','◉','○'];
    return setInterval(() => {
      const icon = icons[i % icons.length];
      process.stdout.write(`\r  ${icon} ${label}... `);
      i++;
    }, 200);
  }

  // ── LIVE WALK ────────────────────────────────────────────────────
  async _liveWalk(dir, report, maxDepth, depth) {
    if (depth >= maxDepth) return;
    report.dirs.push(dir);
    
    const indent = '  '.repeat(Math.min(depth, 5));
    if (depth === 0) console.log(`${indent}📁 ${path.basename(dir)}/`);

    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    const dirs = entries.filter(e => e.isDirectory());
    const files = entries.filter(e => e.isFile());

    for (const entry of [...dirs, ...files]) {
      if (entry.name.startsWith('.') && entry.name !== '.flock') continue;
      if (entry.name === 'node_modules' && depth > 0) {
        if (depth === 1) console.log(`${indent}  📦 node_modules/ (${this._countMods(path.join(dir, 'node_modules'))})`);
        continue;
      }

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this._liveWalk(full, report, maxDepth, depth + 1);
      } else {
        try {
          const s = fs.statSync(full);
          report.files.push({ path: full, size: s.size, ext: path.extname(entry.name) });
          report.totalSize += s.size;
        } catch {}
      }
    }

    // Show file summary per directory
    if (depth <= 2 && files.length > 0) {
      const localFiles = files.filter(f => {
        try {
          report.files.find(rf => rf.path === path.join(dir, f.name));
          return true;
        } catch { return false; }
      });
      if (localFiles.length > 8) {
        const exts = {};
        localFiles.forEach(f => { const e = path.extname(f.name) || 'other'; exts[e] = (exts[e]||0)+1; });
        const summary = Object.entries(exts).sort((a,b)=>b[1]-a[1]).map(([e,n])=>`${e}×${n}`).join(' ');
        console.log(`${indent}  ┕ ${localFiles.length} files: ${summary}`);
      }
    }
  }

  _countMods(dir) {
    try { return fs.readdirSync(dir).filter(d => !d.startsWith('.') && !d.startsWith('@')).length + ' pkgs'; }
    catch { return '?'; }
  }

  // ── KEY FILES ──────────────────────────────────────────────────
  async _readKeyFiles(report) {
    const patterns = ['package.json','README.md','ADMINReadme.md','Makefile','Dockerfile',
                      'index.js','index.html','server.js','app.js','master_prompt.txt',
                      'config.json','tsconfig.json','vite.config.js'];
    let found = 0;
    for (const file of report.files) {
      const base = path.basename(file.path);
      if (patterns.some(p => base === p)) {
        try {
          const content = fs.readFileSync(file.path, 'utf8');
          const lines = content.split('\n').length;
          report.keyFiles[base] = { lines, size: file.size, preview: content.substring(0, 100).replace(/\n/g, ' '), content };
          console.log(`  📖 ${base.padEnd(18)} ${String(lines).padStart(4)}L  ${this._fmt(file.size).padStart(8)}  ${content.substring(0, 60).replace(/\n/g, ' ')}...`);
          found++;
        } catch {}
      }
    }
    if (!found) console.log(`  · No standard key files`);
  }

  // ── HEURISTIC ANALYSIS ─────────────────────────────────────────
  _quickAnalyze(report) {
    const exts = {};
    report.files.forEach(f => { exts[f.ext] = (exts[f.ext] || 0) + 1; });
    
    const fileNames = report.files.map(f => path.basename(f.path));
    const dirNames = report.dirs.map(d => path.basename(d));
    const totalJS = (exts['.js']||0) + (exts['.ts']||0) + (exts['.jsx']||0) + (exts['.tsx']||0);
    
    const hasPkg = fileNames.includes('package.json');
    const hasVite = fileNames.includes('vite.config.js') || fileNames.includes('vite.config.ts');
    const hasReact = exts['.jsx'] || exts['.tsx'];
    const hasAndroid = dirNames.includes('android');
    const hasTests = dirNames.some(d => d.includes('test'));
    const hasDocs = dirNames.includes('docs');

    let projectType = 'generic';
    if (hasAndroid) projectType = 'android';
    else if (hasReact && hasVite) projectType = 'react-app';
    else if (hasVite) projectType = 'web-vite';
    else if (exts['.html']) projectType = 'web';
    else if (hasPkg && totalJS > 10) projectType = 'cli-tool';
    else if (hasPkg && totalJS > 3) projectType = 'node-module';
    else if (hasDocs) projectType = 'docs';
    else if (totalJS === 0 && exts['.md']) projectType = 'docs';

    // Stack detection
    const stack = [];
    if (hasPkg) {
      stack.push('Node.js');
      try {
        const pkg = JSON.parse(report.keyFiles['package.json']?.content || '{}');
        const deps = {...(pkg.dependencies||{}), ...(pkg.devDependencies||{})};
        if (deps.react) stack.push('React');
        if (deps.vite) stack.push('Vite');
        if (deps.next) stack.push('Next.js');
        if (deps.express) stack.push('Express');
        if (deps.ollama) stack.push('Ollama');
        if (deps.typescript || deps['@types/node']) stack.push('TypeScript');
        if (deps.tailwindcss) stack.push('Tailwind');
        if (deps.chalk) stack.push('Chalk');
      } catch {}
    }
    if (exts['.ts'] || exts['.tsx']) stack.push('TypeScript');
    if (exts['.py']) stack.push('Python');
    if (exts['.html']) stack.push('HTML');
    if (exts['.css']) stack.push('CSS');
    if (hasAndroid) stack.push('Android');

    return {
      projectType,
      stack: [...new Set(stack)],
      topExtensions: Object.entries(exts).sort((a,b) => b[1]-a[1]).slice(0, 6),
      hasTests,
      hasDocs,
      complexity: report.files.length > 80 ? 'high' : report.files.length > 30 ? 'medium' : 'low',
      entryPoint: fileNames.find(f => f === 'index.js' || f === 'server.js' || f === 'app.js') || 'unknown'
    };
  }

  // ── AI ANALYSIS (lightweight, 30s timeout) ─────────────────────
  async _aiAnalyze(report, heuristics) {
    const pkgName = report.keyFiles['package.json']?.content?.match(/"name"\s*:\s*"([^"]+)"/)?.[1] || path.basename(report.resolved);
    const pkgDesc = report.keyFiles['package.json']?.content?.match(/"description"\s*:\s*"([^"]+)"/)?.[1] || '';
    const readmeFirst = (report.keyFiles['README.md']?.preview || report.keyFiles['ADMINReadme.md']?.preview || '').substring(0, 150);

    const prompt = `${pkgName} — ${pkgDesc}
${heuristics.projectType} | ${report.files.length} files | ${this._fmt(report.totalSize)}
Stack: ${heuristics.stack.join(', ') || 'none'}
${readmeFirst}

Return JSON: {"purpose":"1 sentence","quality":1-10,"risks":[],"tip":"1 improvement"}`;

    try {
      const resp = await Promise.race([
        this.brain.chat([
          { role: 'system', content: 'Code auditor. Return ONLY valid JSON. No markdown.' },
          { role: 'user', content: prompt }
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000))
      ]);

      const jsonMatch = resp.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`    Purpose : ${parsed.purpose}`);
        console.log(`    Quality : ${parsed.quality}/10`);
        if (parsed.risks?.length) console.log(`    Risks   : ${parsed.risks.join(', ')}`);
        if (parsed.tip) console.log(`    Tip     : ${parsed.tip}`);
        return parsed;
      }
    } catch(e) {
      // Timeout or parse error — heuristic is good enough
    }
    
    return null;
  }

  // ── VERIFY ──────────────────────────────────────────────────────
  async _verify(report) {
    const names = report.files.map(f => path.basename(f.path));
    const checks = [
      { id:'exists', pass:true, label:'Path exists' },
      { id:'readme', pass:names.some(f => f.toLowerCase().includes('readme')), label:'Has README' },
      { id:'package', pass:names.includes('package.json'), label:'Has package.json' },
      { id:'lockfile', pass:names.some(f => f.includes('lock')), label:'Has lockfile' },
      { id:'gitignore', pass:names.includes('.gitignore'), label:'Has .gitignore' },
      { id:'source', pass:report.files.some(f => ['.js','.ts','.py','.html','.jsx','.tsx'].includes(f.ext)), label:'Has source code' },
      { id:'tests', pass:report.files.some(f => f.path.includes('.test.') || f.path.includes('.spec.')), label:'Has tests' },
      { id:'dotfiles', pass:names.some(f => f.startsWith('.') && !f.startsWith('.git')), label:'Has dotfiles' },
      { id:'size', pass:report.totalSize < 500*1024*1024, label:`Size OK (${this._fmt(report.totalSize)})` },
    ];

    checks.forEach(c => console.log(`  ${c.pass ? '✓' : '✕'} ${c.label}`));

    const passed = checks.filter(c => c.pass).length;
    const score = Math.round((passed/checks.length)*100);
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
    console.log(`  ┕ Grade: ${grade} · ${passed}/${checks.length} · ${score}%`);

    return { checks, passed, total: checks.length, score, grade, failed: checks.filter(c => !c.pass).map(c => c.id) };
  }

  // ── STORE ───────────────────────────────────────────────────────
  async _store(report) {
    const skillDir = path.join(process.env.HOME, '.flock', 'skills');
    fs.mkdirSync(skillDir, { recursive: true });
    const data = {
      project: path.basename(report.resolved),
      audited: report.timestamp,
      files: report.files.length, size: this._fmt(report.totalSize),
      type: report.aiAnalysis?.purpose || 'unknown',
      grade: report.verify?.grade
    };
    fs.writeFileSync(path.join(skillDir, `audit_${path.basename(report.resolved)}.json`), JSON.stringify(data, null, 2));
  }

  // ── REPORT ──────────────────────────────────────────────────────
  _printReport(report, heuristics) {
    const v = report.verify;
    const a = report.aiAnalysis;
    const gradeIcon = v?.grade === 'A' ? '🟢' : v?.grade === 'B' ? '🔵' : v?.grade === 'C' ? '🟡' : '🔴';
    
    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║  ${path.basename(report.resolved).padEnd(32)}  ║`);
    console.log(`  ╠══════════════════════════════════════╣`);
    console.log(`  ║ ${'Type:'.padEnd(10)} ${heuristics.projectType.padEnd(25)} ║`);
    console.log(`  ║ ${'Stack:'.padEnd(10)} ${heuristics.stack.slice(0,4).join(', ').substring(0,25).padEnd(25)} ║`);
    console.log(`  ║ ${'Files:'.padEnd(10)} ${String(report.files.length).padEnd(25)} ║`);
    console.log(`  ║ ${'Size:'.padEnd(10)} ${this._fmt(report.totalSize).padEnd(25)} ║`);
    if (a?.purpose) console.log(`  ║ ${'Purpose:'.padEnd(10)} ${a.purpose.substring(0,25).padEnd(25)} ║`);
    if (v?.grade) console.log(`  ║ ${'Grade:'.padEnd(10)} ${(gradeIcon + ' ' + v.grade + ' (' + v.score + '%)').padEnd(25)} ║`);
    console.log(`  ╚══════════════════════════════════════╝`);

    if (v?.failed?.length) {
      console.log(`\n  ⚠  Missing: ${v.checks.filter(c => !c.pass).map(c => c.label.toLowerCase()).join(', ')}`);
    }
    if (a?.risks?.length) console.log(`  ⚡ Risks: ${a.risks.join(', ')}`);
    if (a?.tip) console.log(`  💡 ${a.tip}`);
    
    // Mini composition
    const exts = {};
    report.files.forEach(f => { exts[f.ext||'other'] = (exts[f.ext||'other']||0) + 1; });
    const top = Object.entries(exts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    console.log(`  📊 ${top.map(([e,n])=>`${e}×${n}`).join('  ')}`);
    console.log('');
  }

  _fmt(bytes) {
    if (!bytes) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
  }
}
