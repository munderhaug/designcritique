#!/usr/bin/env node
// Record your verdict on a finding so every later run applies it, or list what you've decided.
//
// Usage:
//   node scripts/report/decide.mjs --run <RUN_DIR> --finding <n|id> --dismiss --reason "..."
//   node scripts/report/decide.mjs --run <RUN_DIR> --finding <n|id> --severity P3 --reason "..."
//   node scripts/report/decide.mjs --run <RUN_DIR> --finding <n|id> --accept
//     add --eval-candidate to mark it as a case worth adding to evals/
//   node scripts/report/decide.mjs --run <RUN_DIR> --proposal M2 --accept|--reject|--defer [--reason "..."]
//     your decision on a structural or scope proposal (moves M1…, scope S1… in the report); never
//     applied automatically, but reviewers and iterate respect it
//   node scripts/report/decide.mjs --project <dir> --list
//     decisions grouped by principle and critic: where the critics are miscalibrated
import path from 'node:path';
import { parseArgs, readJson, SEVERITIES } from '../lib/config.mjs';
import { loadDecisions, saveDecisions, decisionFromFinding, decisionsPath } from '../lib/decisions.mjs';

const args = parseArgs(process.argv.slice(2));
const fail = (m) => { console.error(m); process.exit(2); };

if (args.list) {
  const baseDir = args.project ? path.resolve(args.project) : args.run ? readJson(path.join(path.resolve(args.run), 'manifest.json')).baseDir : process.cwd();
  const decisions = loadDecisions(baseDir);
  if (!decisions.length) { console.log(`No decisions in ${decisionsPath(baseDir)}`); process.exit(0); }
  const groups = new Map();
  for (const d of decisions) {
    const key = `${d.rule} · ${d.source || 'any'}`;
    const g = groups.get(key) || { dismiss: 0, severity: 0, accept: 0, eval: 0 };
    g[d.decision]++;
    if (d.eval_candidate) g.eval++;
    groups.set(key, g);
  }
  console.log('principle · critic                 dismissed  re-rated  accepted  eval candidates');
  for (const [k, g] of [...groups].sort((a, b) => (b[1].dismiss + b[1].severity) - (a[1].dismiss + a[1].severity))) {
    console.log(`${k.padEnd(36)} ${String(g.dismiss).padStart(9)} ${String(g.severity).padStart(9)} ${String(g.accept).padStart(9)} ${String(g.eval).padStart(16)}`);
  }
  console.log('\nA principle that keeps being dismissed or re-rated is a calibration problem: add an eval case');
  console.log('(evals/README.md) or sharpen the principle text, rather than dismissing it run after run.');
  process.exit(0);
}

if (args.run && args.proposal) {
  const runDir = path.resolve(args.run);
  const merged = readJson(path.join(runDir, 'findings.json'));
  const manifest = readJson(path.join(runDir, 'manifest.json'));
  const p = (merged.review?.proposals || []).find((x) => x.id === String(args.proposal).toUpperCase());
  if (!p) fail(`No proposal ${args.proposal} in ${runDir}/findings.json (proposals: ${(merged.review?.proposals || []).map((x) => x.id).join(', ') || 'none'})`);
  const decision = args.accept ? 'accept' : args.reject ? 'reject' : args.defer ? 'defer' : null;
  if (!decision) fail('Say --accept, --reject or --defer');
  const decisions = loadDecisions(manifest.baseDir).filter((d) => !(d.kind === 'proposal' && d.item === p.item && d.verdict === p.verdict));
  decisions.push({ kind: 'proposal', item: p.item, verdict: p.verdict, ...(p.to ? { to: p.to } : {}), ...(p.from ? { from: p.from } : {}), decision, reason: args.reason === true ? '' : (args.reason || ''), date: new Date().toISOString().slice(0, 10), ...(args.by ? { by: args.by } : {}) });
  saveDecisions(manifest.baseDir, decisions);
  console.log(`Recorded: ${decision} for ${p.id} (${p.verdict} ${p.item}${p.to ? ` → ${p.to}` : ''}) in ${decisionsPath(manifest.baseDir)}`);
  process.exit(0);
}

if (!args.run || !args.finding) fail('Usage: decide.mjs --run <RUN_DIR> --finding <n|id> (--dismiss | --severity P0-P3 | --accept) [--reason "..."] [--eval-candidate]');
const choice = args.dismiss ? 'dismiss' : args.severity ? 'severity' : args.accept ? 'accept' : null;
if (!choice) fail('Say --dismiss, --severity P0-P3 or --accept');
if (choice === 'severity' && !SEVERITIES.includes(args.severity)) fail(`--severity must be one of ${SEVERITIES.join(', ')}`);
if (choice === 'dismiss' && !args.reason) fail('Give a --reason for a dismissal; critics read it in their next brief.');

const runDir = path.resolve(args.run);
const merged = readJson(path.join(runDir, 'findings.json'));
const manifest = readJson(path.join(runDir, 'manifest.json'));
const want = String(args.finding);
const f = merged.findings.find((x) => String(x.n) === want || x.id === want);
if (!f) fail(`No open finding ${want} in ${runDir}/findings.json`);

const decisions = loadDecisions(manifest.baseDir).filter((d) => !(d.screen === f.screen && d.rule === f.rule && d.title === f.title));
decisions.push(decisionFromFinding(f, {
  decision: choice, severity: args.severity, reason: args.reason === true ? '' : args.reason,
  by: args.by, evalCandidate: !!args['eval-candidate'],
}));
saveDecisions(manifest.baseDir, decisions);
console.log(`Recorded: ${choice}${choice === 'severity' ? ` ${args.severity}` : ''} for #${f.n} "${f.title}" (${f.screen}, ${f.rule}) in ${decisionsPath(manifest.baseDir)}`);
console.log('Re-render the report to apply it: node scripts/report/render-report.mjs --run ' + runDir);
