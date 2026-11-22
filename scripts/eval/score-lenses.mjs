#!/usr/bin/env node
// Score the whole-product reviewers of a /designcritique:review run on evals/review against
// evals/review/expected.json → lenses. The checks already find every seeded flaw; the reviewers
// are scored on what judgement adds: proposals, verdicts and the principles they cite.
//
// Usage: node scripts/eval/score-lenses.mjs --run <runDir> [--variant seeded|clean]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson } from '../lib/config.mjs';
import { findingCites } from '../lib/match.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: score-lenses.mjs --run <runDir> [--variant seeded|clean]'); process.exit(2); }
const runDir = path.resolve(args.run);
const manifest = readJson(path.join(runDir, 'manifest.json'));
const variant = args.variant || (/v[23]\.yaml/.test(manifest.config || '') ? 'clean' : 'seeded');
const exp = readJson(path.join(here, '../../evals/review/expected.json')).lenses[variant];
const read = (name) => {
  const p = path.join(runDir, 'critique', `${name}.json`);
  return fs.existsSync(p) ? readJson(p) : null;
};
const lenses = Object.fromEntries(['ia', 'scope', 'system', 'anthropic-design', 'impeccable'].map((n) => [n, read(n)]));
const rows = [];
let failures = 0;
const row = (name, ok, note) => { if (!ok) failures++; rows.push(`${name.padEnd(26)} ${ok ? 'pass' : 'FAIL'}  ${note}`); };

if (variant === 'seeded') {
  for (const name of ['ia', 'scope', 'system']) {
    const d = lenses[name];
    const e = exp[name];
    if (!d) { row(name, false, 'not run (no critique/' + name + '.json)'); continue; }
    const cited = e.cites_any.filter((id) => d.findings.some((f) => findingCites(f, id)));
    const needOk = !e.needs
      || (e.needs === 'moves' && (d.moves || []).length > 0)
      || (e.needs === 'scope-cut' && (d.scope || []).some((s) => ['cut', 'defer', 'move'].includes(s.verdict)));
    row(name, cited.length > 0 && needOk, `cites ${cited.join(', ') || 'none'} of ${e.cites_any.join('|')}${e.needs ? `; ${e.needs} ${needOk ? 'present' : 'missing'}` : ''}`);
  }
  const j = exp.journeys;
  for (const name of ['anthropic-design', 'impeccable']) {
    const d = lenses[name];
    if (!d) { row(`${name} (journeys)`, false, 'not run'); continue; }
    const v = (d.journeys || []).find((x) => x.journey === j.journey);
    row(`${name} (journeys)`, !!v && j.verdict_in.includes(v.verdict), `journey ${j.journey}: ${v ? v.verdict : 'not judged'} (want ${j.verdict_in.join(' or ')})`);
  }
} else {
  // A clean prototype: no serious finding, no move a reviewer rates high impact, and nothing the
  // frame puts in the MVP cut or deferred. Lesser proposals are the sparring partner at work.
  const { productModel } = await import('../lib/product.mjs');
  const framing = manifest.framingSnapshot && fs.existsSync(path.join(runDir, manifest.framingSnapshot)) ? fs.readFileSync(path.join(runDir, manifest.framingSnapshot), 'utf8') : '';
  const phaseOf = new Map(productModel(framing).features.map((f) => [f.feature.toLowerCase(), f.phase]));
  const protectedPhases = new Set(exp.no_cut_of_phase || []);
  for (const [name, d] of Object.entries(lenses)) {
    if (!d) continue;
    const major = d.findings.filter((f) => ['P0', 'P1'].includes(f.severity));
    const high = exp.no_high_impact_moves ? (d.moves || []).filter((m) => m.impact === 'high') : [];
    const cutCore = (d.scope || []).filter((s) => ['cut', 'defer'].includes(s.verdict) && protectedPhases.has(phaseOf.get(String(s.feature || '').toLowerCase())));
    const lesser = (d.moves || []).length - high.length + (d.scope || []).filter((s) => ['cut', 'move', 'defer', 'add', 'rethink'].includes(s.verdict)).length - cutCore.length;
    const ok = major.length <= exp.max_major && !high.length && !cutCore.length;
    row(name, ok, `${major.length} P0/P1${major.length ? ` (${major.map((f) => f.title).join(' / ')})` : ''}; ${high.length} high-impact move(s)${high.length ? ` (${high.map((m) => m.item).join(', ')})` : ''}; ${cutCore.length} MVP feature(s) cut or deferred${cutCore.length ? ` (${cutCore.map((s) => s.feature).join(', ')})` : ''}; ${lesser} lesser proposal(s)`);
  }
}
console.log(`Review reviewers on the ${variant} prototype:`);
console.log(rows.join('\n') || 'No reviewer output found in critique/.');
process.exit(failures || !rows.length ? 1 : 0);
