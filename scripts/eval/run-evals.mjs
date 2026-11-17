#!/usr/bin/env node
// Capture the eval set, run the deterministic checks and score them. Critics are scored
// separately: run /designcritique:critique on evals/mockups.yaml, then score.mjs --run <dir>.
//
// Usage: node scripts/eval/run-evals.mjs
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { timestamp } from '../lib/config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runDir = path.join(root, 'evals', '.runs', `checks-${timestamp()}`);
const node = process.execPath;
const step = (script, args) => {
  const r = spawnSync(node, [path.join(root, script), ...args], { stdio: 'inherit' });
  if (r.status !== 0 && script !== 'scripts/eval/score.mjs') process.exit(r.status || 1);
  return r.status;
};

step('scripts/capture/capture.mjs', ['--config', path.join(root, 'evals', 'mockups.yaml'), '--out', runDir, '--offline']);
step('scripts/checks/run-all.mjs', ['--run', runDir]);
step('scripts/report/render-report.mjs', ['--run', runDir]);
process.exit(step('scripts/eval/score.mjs', ['--run', runDir]));
