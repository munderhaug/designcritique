#!/usr/bin/env node
// Motion stage: scans HTML mockups with transitions-agent (transitions.dev, Jakub Antalik) and
// imports its findings. The scanner is deterministic and local, installed by setup.sh at the
// version pinned in package.json, so a critique never downloads it.
//
//   node scripts/checks/motion.mjs scan   --run <runDir>   # plan, run the pinned scanner, import
//   node scripts/checks/motion.mjs plan   --run <runDir>   # writes motion/plan.json, prints the commands
//   node scripts/checks/motion.mjs import --run <runDir>   # writes checks/motion.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson, writeJson } from '../lib/config.mjs';

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (!['scan', 'plan', 'import'].includes(cmd) || !args.run) {
  console.error('Usage: motion.mjs scan|plan|import --run <runDir>');
  process.exit(2);
}
const runDir = path.resolve(args.run);
const manifest = readJson(path.join(runDir, 'manifest.json'));
const planPath = path.join(runDir, 'motion', 'plan.json');

// The scanner's rules mapped to designcritique severity and principles. Its duration scale is
// a web scale, so on iOS and Android "off-scale" stays P3: platform motion conventions win.
const RULES = {
  'untransitioned-overlay': { severity: 'P2', basis: ['VIS-MOTION', 'NORMAN-FEEDBACK'] },
  'recipe-mismatch': { severity: (s) => (s === 'major' ? 'P2' : 'P3'), basis: ['VIS-MOTION'] },
  'no-reduced-motion': { severity: 'P2', basis: ['WCAG-2.3.3', 'IOS-MOTION', 'AND-MOTION'] },
  'slow-duration': { severity: 'P3', basis: ['LAW-RESPONSE', 'VIS-MOTION'] },
  'off-scale': { severity: 'P3', basis: ['VIS-MOTION', 'NN-H4'] },
  'transition-all': { severity: 'P3', basis: ['VIS-MOTION'] },
  'hardcoded-duration': { severity: 'P3', basis: ['DS-SCALE', 'VIS-MOTION'] },
  'inconsistent-durations': { severity: 'P3', basis: ['NN-H4', 'VIS-MOTION'] },
};
// Hover doesn't exist on touch screens; recipe-available is advice, not a problem.
const SKIP = new Set(['hover-without-transition', 'recipe-available']);

const htmlScreens = manifest.screens.filter((s) => s.kind === 'html');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCANNER = path.join(ROOT, 'node_modules', 'transitions-agent', 'bin', 'transitions-agent.mjs');
const scannerCommand = (p) => `node "${SCANNER}" --json --dir "${p.dir}" > "${p.out}"`;

if (cmd === 'plan' || cmd === 'scan') {
  const dirs = [...new Set(htmlScreens.map((s) => path.dirname(path.resolve(manifest.baseDir, s.source))))];
  const plan = dirs.map((dir, i) => ({ dir, out: path.join(runDir, 'motion', `scan-${i + 1}.json`) }));
  writeJson(planPath, plan);
  if (!plan.length) { console.log('No HTML mockups: nothing for the motion scan.'); process.exit(0); }
  if (cmd === 'plan') {
    console.log('Run these (the pinned transitions-agent, local, no account needed):');
    for (const p of plan) console.log(scannerCommand(p));
    process.exit(0);
  }
  if (!fs.existsSync(SCANNER)) {
    console.error(`transitions-agent isn't installed at ${SCANNER}. Run: bash ${path.join(ROOT, 'scripts', 'setup.sh')}`);
    process.exit(1);
  }
  for (const p of plan) {
    const r = spawnSync(process.execPath, [SCANNER, '--json', '--dir', p.dir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0 && !r.stdout.trim()) { console.error(`motion scan failed for ${p.dir}: ${(r.stderr || '').split('\n')[0]}`); continue; }
    fs.mkdirSync(path.dirname(p.out), { recursive: true });
    fs.writeFileSync(p.out, r.stdout);
  }
}

// import
const plan = readJson(planPath, []);
const findings = [];
const notes = [];
const screenBySource = new Map(htmlScreens.map((s) => [path.resolve(manifest.baseDir, s.source), s]));
for (const { dir, out } of plan) {
  if (!fs.existsSync(out)) { notes.push(`No scan output at ${out}; motion not checked for ${dir}.`); continue; }
  let result;
  try { result = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { notes.push(`${out} is not valid JSON.`); continue; }
  notes.push(`transitions-agent motion score for ${path.relative(manifest.baseDir, dir) || '.'}: ${result.score}/100 (${result.grade}), ${result.scannedFiles} files.`);
  for (const f of result.findings || []) {
    if (SKIP.has(f.rule)) continue;
    const map = RULES[f.rule] || { severity: 'P3', basis: ['VIS-MOTION'] };
    const abs = f.path && f.path !== '(project)' ? path.resolve(dir, f.path) : null;
    const screen = abs && screenBySource.get(abs);
    const sev = typeof map.severity === 'function' ? map.severity(f.severity) : map.severity;
    const key = `${f.rule}|${f.path}|${f.line}|${f.message}`;
    findings.push({
      id: `motion-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 10)}`,
      source: 'motion',
      screen: screen ? screen.id : '*',
      mockup: screen ? screen.mockupId : null,
      platform: screen ? screen.platform : null,
      rule: `MOTION-${f.rule}`,
      basis: map.basis,
      category: f.rule === 'no-reduced-motion' ? 'a11y' : 'visual',
      severity: sev,
      title: f.message.split('. ')[0].slice(0, 110),
      element: f.selector ? { selector: f.selector } : null,
      evidence: `transitions-agent ${f.rule} (${f.severity}) at ${f.path}${f.line ? `:${f.line}` : ''}: ${f.message}`,
      recommendation: f.recipe ? `Apply the transitions.dev "${f.recipe}" recipe or token (https://transitions.dev). On iOS and Android, follow the platform's motion conventions where they differ.` : 'Align with the motion tokens and respect reduced motion.',
      confidence: 'high',
    });
  }
}
writeJson(path.join(runDir, 'checks', 'motion.json'), findings);
writeJson(path.join(runDir, 'motion', 'notes.json'), notes);
console.log(`Motion: ${findings.length} findings imported`);
for (const n of notes) console.log(`  ${n}`);
