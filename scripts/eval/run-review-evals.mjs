#!/usr/bin/env node
// Whole-product review eval: crawl, capture, checks and structure on the seeded and clean
// prototypes in evals/review/, scored against evals/review/expected.json. No model involved.
//
// Usage: node scripts/eval/run-review-evals.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const expected = JSON.parse(fs.readFileSync(path.join(root, 'evals/review/expected.json'), 'utf8'));
const run = (script, args) => {
  const r = spawnSync(process.execPath, [path.join(root, script), ...args], { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) { process.stderr.write(r.stderr); process.exit(r.status || 1); }
};
let failures = 0;
for (const variant of ['seeded', 'clean']) {
  const config = path.join(root, 'evals/review', `${variant}.yaml`);
  const out = path.join(root, 'evals', '.runs', `review-${variant}`);
  fs.rmSync(out, { recursive: true, force: true });
  run('scripts/crawl/crawl.mjs', ['--config', config, '--out', out, '--offline']);
  run('scripts/capture/capture.mjs', ['--config', config, '--out', out, '--inventory', path.join(out, 'inventory.json'), '--offline']);
  run('scripts/checks/run-all.mjs', ['--run', out, '--review']);
  const found = ['structure.json', 'consistency.json'].flatMap((f) => {
    const p = path.join(out, 'checks', f);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
  });
  const rules = new Set(found.map((f) => f.rule));
  const must = expected[variant].must;
  const missing = must.filter((r) => !rules.has(r));
  const unexpected = variant === 'clean' ? expected.watch.filter((r) => rules.has(r)) : [];
  // The clean version must pass the gate's finding rule too: no P0-P2 from any check.
  const dirty = variant === 'clean'
    ? JSON.parse(fs.readFileSync(path.join(out, 'checks', 'all.json'), 'utf8')).filter((f) => f.severity !== 'P3')
    : [];
  if (missing.length || unexpected.length || dirty.length) failures++;
  console.log(`${variant.padEnd(7)} ${missing.length || unexpected.length || dirty.length ? 'FAIL' : 'pass'}  recall ${must.length - missing.length}/${must.length}${missing.length ? ` (missing ${missing.join(', ')})` : ''}${variant === 'clean' ? `, false alarms ${unexpected.length}${unexpected.length ? ` (${unexpected.join(', ')})` : ''}, P0-P2 from any check ${dirty.length}${dirty.length ? ` (${[...new Set(dirty.map((f) => `${f.rule} ${f.severity}`))].join(', ')})` : ''}` : ''}`);
}
process.exit(failures ? 1 : 0);
