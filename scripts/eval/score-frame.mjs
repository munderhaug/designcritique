#!/usr/bin/env node
// Score the sparring stages of a run (the cold read and the frame challenge) against
// evals/frame/expected.json: did the cold reader describe what the screens show, not what the
// frame says, and did the challenger question the frame where it is wrong and stay calm where
// it is sound?
//
// Usage: node scripts/eval/score-frame.mjs --run <runDir> [--variant flawed|control]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson } from '../lib/config.mjs';
import { idMatches } from '../lib/match.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: score-frame.mjs --run <runDir> [--variant flawed|control]'); process.exit(2); }
const runDir = path.resolve(args.run);
const manifest = readJson(path.join(runDir, 'manifest.json'));
const variant = args.variant || (/evals\/frame\//.test(manifest.config || '') ? 'flawed' : 'control');
const exp = readJson(path.join(here, '../../evals/frame/expected.json'))[variant];
const reading = readJson(path.join(runDir, 'blind', 'reading.json'), null);
const frame = readJson(path.join(runDir, 'critique', 'frame.json'), null);
const fails = [];
const has = (text, words) => words.some((w) => String(text || '').toLowerCase().includes(w));

if (!reading) fails.push('no cold reading (blind/reading.json)');
else {
  const all = [reading.product, reading.problem, ...(reading.tasks || [])].join(' ');
  if (exp.cold.mentions_any && !has(all, exp.cold.mentions_any)) fails.push(`cold reading doesn't mention any of: ${exp.cold.mentions_any.join(', ')}`);
  if (exp.cold.not_first_task && has((reading.tasks || [])[0], exp.cold.not_first_task)) fails.push(`cold reading's first task echoes the frame: "${reading.tasks[0]}"`);
}
if (!frame) fails.push('no frame challenge (critique/frame.json)');
else {
  const ch = frame.challenges || [];
  for (const want of exp.challenges.must || []) {
    const options = typeof want === 'string' ? [want] : want.any;
    if (!ch.some((c) => (c.basis || []).some((b) => options.some((o) => idMatches(b, o))))) fails.push(`no challenge cites ${options.join(' or ')}`);
  }
  if (exp.challenges.max != null && ch.length > exp.challenges.max) fails.push(`${ch.length} challenges (at most ${exp.challenges.max})`);
  const k = exp.challenges.no_confident_kind;
  if (k && ch.some((c) => c.kind === k && c.confidence === 'high')) fails.push(`a high-confidence ${k} challenge on a frame that matches its screens`);
  if ((frame.findings || []).length) fails.push('the frame challenger returned findings; it returns challenges only');
  console.log(`challenges: ${ch.length} (${ch.map((c) => `${c.kind}:${(c.basis || []).join('+')}`).join(', ')})`);
}
console.log(`${variant}  ${fails.length ? 'FAIL' : 'pass'}${fails.length ? `  ${fails.join('; ')}` : ''}`);
process.exit(fails.length ? 1 : 0);
