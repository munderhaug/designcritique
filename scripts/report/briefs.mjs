#!/usr/bin/env node
// Write every reviewer's brief for a run, and the plan that says who runs when.
//   <run>/blind/NN.png + key.json   numbered copies for the cold reader (no names)
//   <run>/briefs/<name>.txt         the brief to give that reviewer, complete
//   <run>/briefs/plan.json          stages in order; per reviewer: agent, model, brief file, save command
//   <run>/carry.json, critique/carried-*.json   with --base: batch findings kept for unchanged screens
//
// The orchestrating model spawns each reviewer with its brief unchanged and saves the reply with
// the command given. It never fills a template, picks a batch or decides coverage.
//
// Usage: node scripts/report/briefs.mjs --run <RUN_DIR> [--base <earlier run folder or name>]
// With --base (bare: the newest earlier finished run), screens byte-identical to the base run's
// keep its close-look batch findings and get no new batch; every other reviewer still runs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson, writeJson } from '../lib/config.mjs';
import { parseKeyTasks } from '../lib/product.mjs';
import { decisionsPath } from '../lib/decisions.mjs';
import { blindScreens, writeBlindSet } from '../lib/blind.mjs';
import { planReviewers, judgedScreens, batches } from '../lib/briefs.mjs';
import { carryRun, clearCarry } from '../lib/carry.mjs';
import { findPreviousRun } from '../lib/compare.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: briefs.mjs --run <RUN_DIR>'); process.exit(2); }
const runDir = path.resolve(args.run);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = readJson(path.join(runDir, 'manifest.json'));

// Screen family of a captured screen (its fingerprint's screen key), so a crawl's many states of
// one screen are read and judged once.
const familyOf = (s) => {
  const cap = s.captures.find((c) => c.variant === 'light' && c.device === 'standard') || s.captures[0];
  try { return cap?.data ? readJson(path.join(runDir, cap.data)).fingerprint?.screenKey || null : null; } catch { return null; }
};

const found = spawnSync(process.execPath, [path.join(root, 'scripts', 'companions.mjs'), '--project', manifest.baseDir], { encoding: 'utf8' });
let companions = {};
try { companions = Object.fromEntries(Object.entries(JSON.parse(found.stdout)).map(([k, v]) => [k, v.path])); } catch { /* none found: reviewers fall back to the principles index */ }

const framing = manifest.framingSnapshot && fs.existsSync(path.join(runDir, manifest.framingSnapshot)) ? fs.readFileSync(path.join(runDir, manifest.framingSnapshot), 'utf8') : '';
const blindKey = writeBlindSet(runDir, blindScreens(manifest, familyOf));
const decisions = fs.existsSync(decisionsPath(manifest.baseDir)) ? decisionsPath(manifest.baseDir) : null;
// Carry-over from a base run, decided before the plan so unchanged screens get no new batch.
let carry = null;
if (args.base) {
  const baseDir = args.base === true ? findPreviousRun(runDir)
    : [path.resolve(String(args.base)), path.join(path.dirname(runDir), String(args.base))].find((p) => fs.existsSync(path.join(p, 'manifest.json')));
  if (!baseDir) { console.error(`No base run${args.base === true ? ' next to this one' : ` at ${args.base}`} with a manifest.json; nothing carried.`); clearCarry(runDir); }
  else {
    const judged = judgedScreens(manifest, familyOf).screens;
    carry = carryRun({ runDir, baseDir, manifest, judged: batches(judged).length > 1 ? judged.map((s) => s.id) : null });
  }
} else clearCarry(runDir);
const plan = planReviewers({
  manifest, runDir, pluginRoot: root, keyTasks: parseKeyTasks(framing), companions, blindKey, decisions, familyOf,
  hasReferences: fs.existsSync(path.join(runDir, 'references.md')), skip: new Set(carry?.skipped || []),
});

const dir = path.join(runDir, 'briefs');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (const r of plan.reviewers) fs.writeFileSync(path.join(dir, `${r.name}.txt`), `${r.brief}\n`);
writeJson(path.join(dir, 'plan.json'), {
  note: 'Run the stages in order. Within a stage, spawn the reviewers in parallel; none sees another\'s output. Give each its brief file unchanged, then save its reply with its save command.',
  stages: plan.stages.map((st) => st.map((r) => ({ name: r.name, agent: r.agent, model: r.model, coverage: r.coverage, ...(r.screens ? { screens: r.screens } : {}), brief: `briefs/${r.name}.txt`, saves_to: r.file, save: r.save }))),
  ...(carry ? { carry: { base: carry.base, skipped: carry.skipped.length, carried: carry.carried, reason: carry.reason } } : {}),
  estimate: plan.estimate,
  sharing: plan.local ? 'local' : 'normal',
  warnings: plan.warnings,
});
const missing = ['design-critique', 'accessibility-review', 'ux-copy', 'impeccable'].filter((n) => !companions[n]);
console.log(`Briefs: ${plan.reviewers.length} reviewers in ${plan.stages.length} stages for ${plan.screens} screens${plan.review ? ' (whole-product review: one per screen family)' : ''} → ${path.join(dir, 'plan.json')}`);
for (const [i, st] of plan.stages.entries()) console.log(`  ${i + 1}. ${st.map((r) => `${r.name} (${r.model || 'any model'})`).join(', ')}`);
const e = plan.estimate;
console.log(`  Estimated: ${e.agents} reviewer agents, about ${(e.tokens / 1e6).toFixed(1)} M tokens, about ${e.minutes} minutes with each stage in parallel (from this plugin's measured runs).`);
if (carry) {
  const n = Object.values(carry.carried).reduce((a, b) => a + b, 0);
  console.log(`  Carried from ${carry.base}: ${carry.skipped.length} unchanged screen(s) keep its batch findings (${n}) and get no new batch${carry.reason ? `; nothing skipped: ${carry.reason}` : ''}.`);
}
if (plan.local) console.log('  Sharing: local. The designs go to the model reviewers only: no external judges, reference searches or connected services.');
for (const w of plan.warnings) console.log(`  warning: ${w}`);
if (missing.length) console.log(`  Not installed: ${missing.join(', ')}. ${companions.impeccable ? '' : 'The Impeccable critic is left out. '}Reviewers fall back to the principles index and say so (setup.sh --install-companions).`);
