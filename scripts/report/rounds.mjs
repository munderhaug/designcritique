#!/usr/bin/env node
// Snapshots of the mockups for /designcritique:iterate, so the loop can end on its best round
// rather than its last one.
//
// Usage:
//   node scripts/report/rounds.mjs save    --config mockups.yaml --round N --run <RUN_DIR>
//       copies the HTML mockups (files and folders) as they were judged in RUN_DIR
//   node scripts/report/rounds.mjs best    --config mockups.yaml     prints a table and the best round
//   node scripts/report/rounds.mjs restore --config mockups.yaml --round N
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, parseArgs, readJson, writeJson } from '../lib/config.mjs';
import { bestRound } from '../lib/gate.mjs';

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const fail = (m) => { console.error(m); process.exit(2); };
if (!['save', 'best', 'restore'].includes(cmd)) fail('Usage: rounds.mjs save|best|restore --config mockups.yaml [--round N] [--run RUN_DIR]');

const cfg = loadConfig(args.config || 'mockups.yaml');
const dir = path.join(cfg.baseDir, '.designcritique', 'iterate');
const roundDir = (n) => path.join(dir, `round-${n}`);
const editable = cfg.mockups.filter((m) => m.kind === 'html' || m.kind === 'dir').map((m) => {
  const rel = path.relative(cfg.baseDir, m.file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail(`Mockup ${m.id} is outside ${cfg.baseDir}; iterate only edits files next to mockups.yaml.`);
  return rel;
});

if (cmd === 'save') {
  const n = Number(args.round);
  if (!Number.isInteger(n) || n < 1) fail('--round must be 1 or more');
  if (!args.run) fail('--run is required: the run that judged these files');
  const run = path.resolve(args.run);
  if (!fs.existsSync(path.join(run, 'findings.json'))) fail(`Render the report first: no findings.json in ${run}`);
  fs.rmSync(roundDir(n), { recursive: true, force: true });
  for (const rel of [...new Set(editable)]) fs.cpSync(path.join(cfg.baseDir, rel), path.join(roundDir(n), 'files', rel), { recursive: true });
  writeJson(path.join(roundDir(n), 'round.json'), { round: n, run, files: editable, savedAt: new Date().toISOString() });
  console.log(`Saved round ${n}: ${editable.length} mockup file(s), judged in ${run}`);
}

if (cmd === 'best') {
  const rounds = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => /^round-\d+$/.test(d)) : [];
  const loaded = rounds.map((d) => readJson(path.join(dir, d, 'round.json')))
    .map((r) => ({ round: r.round, run: r.run, merged: readJson(path.join(r.run, 'findings.json')) }))
    .sort((a, b) => a.round - b.round);
  if (!loaded.length) fail(`No saved rounds in ${dir}`);
  const best = bestRound(loaded);
  console.log('round  gate  P0  P1  P2  lowest task score');
  for (const r of loaded) {
    const s = bestRound([r]).standing;
    console.log(`${String(r.round).padStart(5)}  ${s.pass ? 'pass' : 'fail'}  ${String(s.p0).padStart(2)}  ${String(s.p1).padStart(2)}  ${String(s.p2).padStart(2)}  ${s.lowest ?? '–'}${r.round === best.round ? '   <- best' : ''}`);
  }
  console.log(`BEST_ROUND=${best.round}`);
}

if (cmd === 'restore') {
  const n = Number(args.round);
  const meta = path.join(roundDir(n), 'round.json');
  if (!fs.existsSync(meta)) fail(`No saved round ${args.round} in ${dir}`);
  for (const rel of readJson(meta).files) {
    const src = path.join(roundDir(n), 'files', rel);
    fs.rmSync(path.join(cfg.baseDir, rel), { recursive: true, force: true });
    fs.cpSync(src, path.join(cfg.baseDir, rel), { recursive: true });
  }
  console.log(`Restored the mockups from round ${n}.`);
}
