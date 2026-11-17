#!/usr/bin/env node
// Pass or fail a rendered run against the bar in mockups.yaml (gate: fail_on, target_score).
// Exit 0 when it passes, 2 when it doesn't (so a Stop hook or CI step sends the reasons back).
//
// Usage: node scripts/report/gate.mjs --run <RUN_DIR> [--fail-on P0|P1|P2|P3|none] [--target 0-10]
import path from 'node:path';
import { parseArgs, readJson, normalizeGate } from '../lib/config.mjs';
import { evaluateGate } from '../lib/gate.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: gate.mjs --run <RUN_DIR> [--fail-on P1] [--target 8]'); process.exit(2); }
const runDir = path.resolve(args.run);
const merged = readJson(path.join(runDir, 'findings.json'));
const manifest = readJson(path.join(runDir, 'manifest.json'));
const gate = normalizeGate({
  ...(manifest.gate || {}),
  ...(args['fail-on'] ? { fail_on: args['fail-on'] } : {}),
  ...(args.target != null ? { target_score: args.target } : {}),
});
const rv = merged.review || {};
const r = evaluateGate({ findings: merged.findings, tasks: merged.tasks, critics: merged.coverage?.critics || [], journeys: rv.journeysJudged || [], coverage: rv.coverage || null, criticalJourneys: rv.criticalJourneys || [], keyTasks: merged.keyTasks || [] }, gate);
for (const s of r.scores) console.log(`  ${String(s.score).padStart(4)}  ${s.task}`);
for (const s of r.journeyScores || []) console.log(`  ${String(s.score).padStart(4)}  journey ${s.task}`);
if (r.pass) { console.log(`Gate passed (fail on ${gate.fail_on}, target ${gate.target_score ?? 'none'}).`); process.exit(0); }
console.error(`designcritique gate failed (fail on ${gate.fail_on}, target ${gate.target_score ?? 'none'}):\n- ${r.reasons.join('\n- ')}\nSee ${path.join(runDir, 'report.md')}.`);
process.exit(2);
