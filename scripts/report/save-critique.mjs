#!/usr/bin/env node
// Save a critic's reply as RUN_DIR/critique/<name>.json in one step: pull the JSON object out of
// the reply (code fences and text around it are dropped), stamp what the orchestrator knows
// (the critic name, and coverage from the brief: a batch is "partial" whatever it wrote),
// validate it, and write it. Read-only reviewers can't write files themselves, and a long reply
// can be cut off on the way back: give the agent's transcript (.jsonl) and the last reply in it
// is used whole.
//
// Usage: node scripts/report/save-critique.mjs --run <RUN_DIR> --blind [--from <file>]   (the cold reading)
//        node scripts/report/save-critique.mjs --run <RUN_DIR> --critic <name>
//          [--name <file name without .json>] [--coverage whole|partial] [--from <reply.txt|transcript.jsonl>]
// Without --from, the reply is read from stdin. Exit 0 when valid, 1 when saved with errors.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, writeJson } from '../lib/config.mjs';
import { validateCritique, repairPrincipleIds, screensForCritiqueFile, keyTasksForCritiqueFile } from '../lib/validate.mjs';
import { extractJson, replyFromTranscript } from '../lib/extract-json.mjs';

const args = parseArgs(process.argv.slice(2));
// The cold reading has its own small shape and its own file.
if (args.run && args.blind) {
  const { validateReading } = await import('../lib/blind.mjs');
  const src = args.from ? fs.readFileSync(path.resolve(args.from), 'utf8') : fs.readFileSync(0, 'utf8');
  const isReading = (d) => typeof d.product === 'string';
  const txt = /\.jsonl$/i.test(args.from || '') ? replyFromTranscript(src, isReading) : src;
  const reading = extractJson(txt, isReading);
  if (!reading) { console.error('No cold reading (a JSON object with "product") found in the reply.'); process.exit(2); }
  const errs = validateReading(reading);
  const out = path.join(path.resolve(args.run), 'blind', 'reading.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  writeJson(out, reading);
  for (const e of errs) console.error(`error: ${e}`);
  console.log(`Saved ${out}${errs.length ? `, ${errs.length} error(s)` : ', valid'}`);
  process.exit(errs.length ? 1 : 0);
}
if (!args.run || !args.critic) {
  console.error('Usage: save-critique.mjs --run <RUN_DIR> --critic <name> [--name <file>] [--coverage whole|partial] [--from <file>]');
  process.exit(2);
}
if (args.coverage && !['whole', 'partial'].includes(args.coverage)) { console.error('--coverage must be whole or partial'); process.exit(2); }

const raw = args.from ? fs.readFileSync(path.resolve(args.from), 'utf8') : fs.readFileSync(0, 'utf8');
const text = /\.jsonl$/i.test(args.from || '') ? replyFromTranscript(raw) : raw;
const data = extractJson(text);
if (!data) { console.error('No JSON object with a findings array found in the reply.'); process.exit(2); }

data.critic = args.critic;
for (const r of repairPrincipleIds(data)) console.error(`repaired: ${r.finding ? `finding ${r.finding}: ` : ''}"${r.from}" → ${r.to}`);
if (args.coverage) for (const t of data.tasks || []) t.coverage = args.coverage;

const file = path.join(path.resolve(args.run), 'critique', `${args.name || args.critic}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
writeJson(file, data);
const { errors, warnings } = validateCritique(data, { screens: screensForCritiqueFile(file), keyTasks: await keyTasksForCritiqueFile(file) });
for (const w of warnings) console.error(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`Saved ${file}: ${data.findings.length} findings${errors.length ? `, ${errors.length} error(s): fix them or ask the critic again` : ', valid'}`);
process.exit(errors.length ? 1 : 0);
