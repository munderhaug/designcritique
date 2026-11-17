#!/usr/bin/env node
// Noise audit for the critics: judge the same run twice and compare.
//
//   node scripts/eval/noise.mjs prepare --run <RUN_A> --out <RUN_B>
//       copies a captured run without its critiques, for the critics to judge again cold
//   node scripts/eval/noise.mjs compare --a <RUN_A> --b <RUN_B>
//       per critic: task-score spread, verdict agreement, finding overlap, severity agreement
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, writeJson } from '../lib/config.mjs';
import { compareJudgements } from '../lib/noise.mjs';

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const fail = (m) => { console.error(m); process.exit(2); };

if (cmd === 'prepare') {
  if (!args.run || !args.out) fail('Usage: noise.mjs prepare --run <RUN_A> --out <RUN_B>');
  const from = path.resolve(args.run); const to = path.resolve(args.out);
  if (fs.existsSync(to)) fail(`${to} exists; choose a new folder`);
  const skip = new Set(['critique', 'findings.json', 'report.md', 'report.html', 'compare.json', 'noise.json']);
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from)) if (!skip.has(e)) fs.cpSync(path.join(from, e), path.join(to, e), { recursive: true });
  fs.mkdirSync(path.join(to, 'critique'));
  console.log(`Prepared ${to}: same screens, checks and frame, no critiques. Run the critics on it as on ${from}, then compare.`);
} else if (cmd === 'compare') {
  if (!args.a || !args.b) fail('Usage: noise.mjs compare --a <RUN_A> --b <RUN_B>');
  const dir = (r) => path.join(path.resolve(r), 'critique');
  const files = fs.readdirSync(dir(args.a)).filter((f) => f.endsWith('.json') && fs.existsSync(path.join(dir(args.b), f)));
  if (!files.length) fail('No critic file present in both runs.');
  const out = {};
  const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
  for (const f of files) {
    const r = compareJudgements(JSON.parse(fs.readFileSync(path.join(dir(args.a), f), 'utf8')), JSON.parse(fs.readFileSync(path.join(dir(args.b), f), 'utf8')));
    out[f.replace(/\.json$/, '')] = r;
    console.log(`${f.replace(/\.json$/, '')}: task scores differ by ${r.meanScoreDiff?.toFixed(1) ?? '–'} on average (max ${r.maxScoreDiff ?? '–'}), same verdict ${pct(r.verdictAgreement)}; findings ${r.findings.a} vs ${r.findings.b}, ${r.findings.both} in both (overlap ${pct(r.findings.overlap)}), same severity ${pct(r.severityAgreement)}`);
    for (const t of r.tasks.filter((x) => x.diff >= 2)) console.log(`  ${t.task}: ${t.a} vs ${t.b}`);
  }
  writeJson(path.join(path.resolve(args.b), 'noise.json'), out);
} else fail('Usage: noise.mjs prepare|compare …');
