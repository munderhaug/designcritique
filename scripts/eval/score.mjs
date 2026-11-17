#!/usr/bin/env node
// Score a run of the eval set against evals/expected.json.
// Checks are always scored. Critics are scored when <run>/critique/*.json exists.
//
// Usage: node scripts/eval/score.mjs --run <runDir> [--expected evals/expected.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson } from '../lib/config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: score.mjs --run <runDir>'); process.exit(2); }
const runDir = path.resolve(args.run);
const expected = readJson(path.resolve(args.expected || path.join(here, '../../evals/expected.json')));
const checks = readJson(path.join(runDir, 'checks', 'findings.json'), []);

const critiqueDir = path.join(runDir, 'critique');
const criticFindings = [];
if (fs.existsSync(critiqueDir)) {
  for (const f of fs.readdirSync(critiqueDir).filter((x) => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(critiqueDir, f), 'utf8'));
      for (const x of d.findings || []) criticFindings.push(x);
    } catch { console.error(`warning: critique/${f} is not valid JSON`); }
  }
}
const haveCritics = fs.existsSync(critiqueDir) && criticFindings.length + fs.readdirSync(critiqueDir).length > 0;

const MAJOR = new Set(['P0', 'P1']);
const ids = (f) => [f.rule, ...(f.basis || [])].filter(Boolean);
const matches = (f, want) => ids(f).some((id) => id === want || id.startsWith(`${want}-`) || id.startsWith(want));

let failures = 0;
const rows = [];
const tally = { checkMust: 0, checkHit: 0, checkFP: 0, criticMust: 0, criticHit: 0, criticFP: 0 };

for (const [screen, exp] of Object.entries(expected)) {
  if (screen.startsWith('$')) continue;
  const mine = checks.filter((f) => f.screen === screen);
  const ce = exp.checks || {};
  const missing = (ce.must || []).filter((r) => !mine.some((f) => f.rule === r));
  const forbidden = (ce.must_not || []).filter((r) => mine.some((f) => f.rule === r));
  const dirty = ce.clean ? mine.filter((f) => f.severity !== 'P3') : [];
  tally.checkMust += (ce.must || []).length;
  tally.checkHit += (ce.must || []).length - missing.length;
  tally.checkFP += forbidden.length + dirty.length;
  const checkOk = !missing.length && !forbidden.length && !dirty.length;
  if (!checkOk) failures++;
  rows.push([screen, 'checks', checkOk ? 'pass' : 'FAIL',
    [missing.length && `missing ${missing.join(', ')}`, forbidden.length && `unexpected ${forbidden.join(', ')}`, dirty.length && `not clean: ${dirty.map((f) => `${f.rule} ${f.severity}`).join(', ')}`].filter(Boolean).join('; ') || `${mine.length} findings`]);

  if (!haveCritics) continue;
  const cr = exp.critic || {};
  const theirs = criticFindings.filter((f) => f.screen === screen || f.screen === '*');
  const missed = [];
  for (const want of cr.must || []) {
    const options = typeof want === 'string' ? [want] : want.any;
    tally.criticMust++;
    if (theirs.some((f) => options.some((o) => matches(f, o)))) tally.criticHit++;
    else missed.push(options.join('|'));
  }
  const major = theirs.filter((f) => f.screen === screen && MAJOR.has(f.severity));
  const tooMany = cr.max_major != null && major.length > cr.max_major;
  if (tooMany) tally.criticFP += major.length - cr.max_major;
  const criticOk = !missed.length && !tooMany;
  if (!criticOk) failures++;
  rows.push([screen, 'critics', criticOk ? 'pass' : 'FAIL',
    [missed.length && `missed ${missed.join(', ')}`, tooMany && `${major.length} P0/P1 on a clean screen (max ${cr.max_major}): ${major.map((f) => f.title).join(' / ')}`].filter(Boolean).join('; ') || `${theirs.length} findings`]);
}

const w = [12, 8, 5];
console.log(rows.map((r) => r.map((c, i) => (i < 3 ? String(c).padEnd(w[i]) : c)).join('  ')).join('\n'));
console.log('');
console.log(`Checks: recall ${tally.checkHit}/${tally.checkMust}, false positives ${tally.checkFP}`);
if (haveCritics) console.log(`Critics: recall ${tally.criticHit}/${tally.criticMust}, false positives on clean screens ${tally.criticFP}`);
else console.log('Critics: not scored (no critique/ folder in this run). Run /designcritique:critique on evals/mockups.yaml first.');
process.exit(failures ? 1 : 0);
