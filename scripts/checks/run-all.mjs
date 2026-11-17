#!/usr/bin/env node
// Every deterministic check on a capture run, in order, then one combined list of what they
// found (checks/all.json) for the critics to skip: they must not spend findings on problems a
// check already reported.
//
//   node scripts/checks/run-all.mjs --run <RUN_DIR> [--review]
//
// Always: screen checks and the design-system checks (run-checks), motion (transitions-agent),
// detectors (Impeccable, unslopovich). With --review (or when the run has a crawl inventory):
// structure and consistency across the whole product.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson, writeJson, CHECK_FILES } from '../lib/config.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: run-all.mjs --run <RUN_DIR> [--review]'); process.exit(2); }
const runDir = path.resolve(args.run);
const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = readJson(path.join(runDir, 'manifest.json'));
const review = !!args.review || !!manifest.inventory;

const steps = [
  ['screen and design-system checks', 'run-checks.mjs', []],
  ['motion', 'motion.mjs', ['scan']],
  ['detectors', 'detectors.mjs', []],
  ...(review ? [['structure', 'structure.mjs', []], ['consistency', 'consistency.mjs', []]] : []),
];

const failed = [];
for (const [label, script, pre] of steps) {
  process.stdout.write(`\n== ${label}\n`);
  const r = spawnSync(process.execPath, [path.join(here, script), ...pre, '--run', runDir], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(label);
}

const all = [];
for (const file of CHECK_FILES) {
  const p = path.join(runDir, 'checks', file);
  if (!fs.existsSync(p)) continue;
  for (const f of readJson(p, [])) {
    all.push({ id: f.id, screen: f.screen, rule: f.rule, basis: f.basis, severity: f.severity, title: f.title, source: f.source, file: `checks/${file}` });
  }
}
writeJson(path.join(runDir, 'checks', 'all.json'), all);
const bySev = Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((s) => [s, all.filter((f) => f.severity === s).length]));
console.log(`\nAll checks: ${all.length} findings ${JSON.stringify(bySev)} → checks/all.json${review ? ' (review: structure and consistency included)' : ''}`);
if (failed.length) { console.error(`Steps that failed: ${failed.join(', ')}. Read their output above; the other steps ran.`); process.exit(1); }
