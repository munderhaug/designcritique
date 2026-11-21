#!/usr/bin/env node
// Whole-product review eval: crawl, capture, checks and structure on the prototypes in
// evals/review/, scored against evals/review/expected.json. No model involved. The folders have
// neutral names because reviewers are given their paths: v1 has the seeded flaws, v2 is clean,
// v3 is v2 built the way app frameworks build (a web-component tab bar in a shadow root, a
// modal sheet, animated page changes, rendering after load) and must be just as clean, with
// every screen reached and no tap failing.
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
const FOLDER = { seeded: 'v1', clean: 'v2', framework: 'v3' };
// --only seeded|clean|framework runs one of them.
const onlyVariant = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7) || (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null);
for (const variant of ['seeded', 'clean', 'framework'].filter((v) => !onlyVariant || v === onlyVariant)) {
  const config = path.join(root, 'evals/review', `${FOLDER[variant]}.yaml`);
  const out = path.join(root, 'evals', '.runs', `review-${FOLDER[variant]}`);
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
  const unexpected = variant !== 'seeded' ? expected.watch.filter((r) => rules.has(r)) : [];
  // The clean version must pass the gate's finding rule too: no P0-P2 from any check.
  const dirty = variant !== 'seeded'
    ? JSON.parse(fs.readFileSync(path.join(out, 'checks', 'all.json'), 'utf8')).filter((f) => f.severity !== 'P3')
    : [];
  // What the crawl must have reached, and that no tap or replay failed on the way.
  const inv = JSON.parse(fs.readFileSync(path.join(out, 'inventory.json'), 'utf8'));
  const want = expected[variant].states || [];
  const lost = want.filter((w) => !inv.states.some((s) => s.title === (w.title || w) && (!w.kind || s.kind === w.kind)));
  const tapErrors = expected[variant].no_failed_taps ? inv.states.flatMap((s) => [...(s.unexplored === 'replay failed' ? [`${s.id}: replay failed`] : []), ...s.actions.filter((a) => a.error).map((a) => `${s.id}: "${a.label}"`)]) : [];
  if (lost.length || tapErrors.length) { failures++; console.log(`${variant.padEnd(9)} FAIL  crawl${lost.length ? ` did not reach ${lost.map((w) => w.title || w).join(', ')}` : ''}${tapErrors.length ? ` had failed taps: ${tapErrors.slice(0, 5).join('; ')}` : ''}`); }
  if (missing.length || unexpected.length || dirty.length) failures++;
  console.log(`${variant.padEnd(9)} ${missing.length || unexpected.length || dirty.length ? 'FAIL' : 'pass'}  recall ${must.length - missing.length}/${must.length}${missing.length ? ` (missing ${missing.join(', ')})` : ''}${variant !== 'seeded' ? `, false alarms ${unexpected.length}${unexpected.length ? ` (${unexpected.join(', ')})` : ''}, P0-P2 from any check ${dirty.length}${dirty.length ? ` (${[...new Set(dirty.map((f) => `${f.rule} ${f.severity}`))].join(', ')})` : ''}` : ''}${want.length ? `, crawl reached ${want.length - lost.length}/${want.length} named states` : ''}`);
}
process.exit(failures ? 1 : 0);
