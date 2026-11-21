#!/usr/bin/env node
// One command for the deterministic part of a critique or a whole-product review, in order:
//   crawl (review) → capture → checks → briefs
// and, after the reviewers have replied:   report → gate
// Each stage's result is kept in <run>/run-status.json, so a run stopped by a time limit or a
// crash continues where it stopped: run the same command again with --run <RUN_DIR>.
//
// Usage:
//   node scripts/run.mjs --config mockups.yaml [--review] [--out <RUN_DIR>] [--offline]
//   node scripts/run.mjs --run <RUN_DIR>                 continue an unfinished run
//   node scripts/run.mjs --run <RUN_DIR> --finish [--inline-thumbs]   report and gate, after the reviewers
//   node scripts/run.mjs --run <RUN_DIR> --from <stage>  redo from a stage (crawl, capture, checks, briefs)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, parseArgs, readJson, writeJson, timestamp } from './lib/config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const STAGES = ['crawl', 'capture', 'checks', 'briefs'];

let runDir = args.run ? path.resolve(args.run) : null;
const statusPath = () => path.join(runDir, 'run-status.json');
let status = runDir && fs.existsSync(statusPath()) ? readJson(statusPath()) : null;
const configPath = args.config ? path.resolve(args.config) : status?.config;
if (!configPath) { console.error('Usage: run.mjs --config mockups.yaml [--review] [--out <RUN_DIR>]  |  run.mjs --run <RUN_DIR> [--finish]'); process.exit(2); }
const cfg = loadConfig(configPath);
if (!runDir) runDir = path.resolve(args.out || path.join(cfg.output, timestamp()));
fs.mkdirSync(runDir, { recursive: true });
status = status || { config: configPath, review: !!(args.review || cfg.crawl), offline: !!args.offline, stages: {} };
if (args.review) status.review = true;
const save = () => writeJson(statusPath(), status);
save();

const node = (script, extra) => spawnSync(process.execPath, [path.join(here, script), ...extra], { stdio: 'inherit' }).status;
const offline = status.offline ? ['--offline'] : [];
const inventory = path.join(runDir, 'inventory.json');
const steps = {
  crawl: () => (status.review && cfg.crawl ? node('crawl/crawl.mjs', ['--config', configPath, '--out', runDir, ...offline]) : 'skipped'),
  // A capture that was interrupted continues; otherwise it starts clean.
  capture: () => {
    const code = cfg.mockups.length ? htmlCapture() : 0;
    // Native apps under native: are captured from a simulator or emulator (experimental).
    return code === 0 && cfg.native.length ? node('capture/native.mjs', ['--config', configPath, '--out', runDir]) : code;
  },
  checks: () => node('checks/run-all.mjs', ['--run', runDir, ...(status.review ? ['--review'] : [])]),
  briefs: () => node('report/briefs.mjs', ['--run', runDir]),
};
const htmlCapture = () => node('capture/capture.mjs', ['--config', configPath, '--out', runDir, ...offline, ...(fs.existsSync(inventory) ? ['--inventory', inventory] : []), ...(status.stages.capture?.resumed && fs.existsSync(path.join(runDir, 'manifest.json')) ? ['--resume'] : [])]);

if (args.finish) {
  const code = node('report/render-report.mjs', ['--run', runDir, ...(args['inline-thumbs'] ? ['--inline-thumbs'] : [])]);
  if (code !== 0) process.exit(code ?? 1);
  process.exit(node('report/gate.mjs', ['--run', runDir]) ?? 1);
}

const from = args.from ? STAGES.indexOf(String(args.from)) : -1;
if (args.from && from < 0) { console.error(`--from must be one of ${STAGES.join(', ')}`); process.exit(2); }
for (const [i, stage] of STAGES.entries()) {
  const prev = status.stages[stage];
  if (i < from || (from < 0 && (prev?.state === 'done' || prev?.state === 'skipped'))) { console.log(`== ${stage}: ${prev?.state || 'kept'}`); continue; }
  console.log(`\n== ${stage}`);
  const wasRunning = prev?.state === 'running';
  status.stages[stage] = { state: 'running', startedAt: new Date().toISOString(), resumed: wasRunning };
  save();
  const code = steps[stage]();
  // The checks exit 1 when a step failed but the others ran: the report says which, so go on.
  const ok = code === 'skipped' || code === 0 || (stage === 'checks' && code === 1);
  status.stages[stage] = { state: code === 'skipped' ? 'skipped' : ok ? 'done' : 'failed', finishedAt: new Date().toISOString(), ...(code === 1 && stage === 'checks' ? { note: 'a check step failed; see checks/status.json' } : {}) };
  for (const later of STAGES.slice(i + 1)) delete status.stages[later];
  save();
  if (!ok) { console.error(`\nStopped at ${stage}. Fix what its output says, then: node ${path.join(here, 'run.mjs')} --run ${runDir}`); process.exit(1); }
}
console.log(`\nRUN_DIR=${runDir}`);
console.log(`Next: spawn the reviewers in ${path.join(runDir, 'briefs', 'plan.json')}, stage by stage, then: node ${path.join(here, 'run.mjs')} --run ${runDir} --finish`);
