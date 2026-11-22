// Carrying screen-level findings from a base run to screens that did not change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { unchangedScreens, carryFindings, carryRun } from '../scripts/lib/carry.mjs';
import { planReviewers } from '../scripts/lib/briefs.mjs';
import { validateCritique } from '../scripts/lib/validate.mjs';

const CAPS = [['ios', 'standard', 'light'], ['ios', 'standard', 'dark'], ['ios', 'compact', 'light']];
const shot = (id, [p, d, v]) => `screenshots/${id}__${p}-${d}__${v}.png`;

/** A run folder with one screen per id, three captures each, and a frame snapshot. */
function makeRun(ids, { frame = 'frame v1', design = 'tokens v1' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-'));
  fs.mkdirSync(path.join(dir, 'screenshots'));
  fs.writeFileSync(path.join(dir, 'framing.md'), frame);
  fs.writeFileSync(path.join(dir, 'DESIGN.md'), design);
  const screens = ids.map((id) => ({
    id, title: id, platform: 'ios',
    captures: CAPS.map((c) => {
      fs.writeFileSync(path.join(dir, shot(id, c)), Buffer.from(`${id}:${c.join('-')}`));
      return { platform: c[0], device: c[1], variant: c[2], screenshot: shot(id, c), data: null };
    }),
  }));
  const manifest = { screens, framingSnapshot: 'framing.md', designSnapshot: 'DESIGN.md', contentSnapshot: null };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return { dir, manifest };
}
const compare = (a, b) => unchangedScreens({ baseDir: a.dir, baseManifest: a.manifest, runDir: b.dir, manifest: b.manifest });

test('carry: identical runs leave every screen unchanged', () => {
  const r = compare(makeRun(['a', 'b', 'c']), makeRun(['a', 'b', 'c']));
  assert.deepEqual(r, { unchanged: ['a', 'b', 'c'], changed: [], reason: null });
});

test('carry: one screenshot byte differs, only that screen changed', () => {
  const base = makeRun(['a', 'b', 'c']); const run = makeRun(['a', 'b', 'c']);
  const f = path.join(run.dir, shot('b', CAPS[1]));
  const buf = fs.readFileSync(f); buf[0] ^= 1; fs.writeFileSync(f, buf);
  assert.deepEqual(compare(base, run), { unchanged: ['a', 'c'], changed: ['b'], reason: null });
});

test('carry: a capture missing in one run makes the screen changed', () => {
  const base = makeRun(['a', 'b']); const run = makeRun(['a', 'b']);
  run.manifest.screens[0].captures.pop();
  assert.deepEqual(compare(base, run).changed, ['a']);
});

test('carry: a changed frame or DESIGN.md leaves nothing unchanged, with a reason', () => {
  const r = compare(makeRun(['a', 'b']), makeRun(['a', 'b'], { frame: 'frame v2' }));
  assert.deepEqual(r.unchanged, []);
  assert.deepEqual(r.changed, ['a', 'b']);
  assert.equal(r.reason, 'frame changed');
  assert.equal(compare(makeRun(['a']), makeRun(['a'], { design: 'tokens v2' })).reason, 'DESIGN.md changed');
});

test('carry: a screen new in the run is changed', () => {
  const r = compare(makeRun(['a', 'b']), makeRun(['a', 'b', 'n']));
  assert.deepEqual(r.unchanged, ['a', 'b']);
  assert.deepEqual(r.changed, ['n']);
});

test('carry: only single-screen design-reviewer findings on unchanged screens carry', () => {
  const f = (id, screen, extra = {}) => ({ id, screen, rule: 'NN-H4', severity: 'P2', title: `t ${id}`, evidence: 'e', recommendation: 'r', ...extra });
  const batch = {
    critic: 'anthropic-design',
    findings: [
      f('F1', 'a'), f('F2', 'b'), f('F3', '*'), f('F4', 'a', { level: 'journey', journey: 'j1' }),
      f('F5', 'a', { level: 'system' }), f('F6', 'a', { affected_screens: ['a', 'b'] }), f('F7', 'gone'),
    ],
    tasks: [{ id: 'T1', task: 'task', verdict: 'supported', score: 8 }],
    challenges: [{ id: 'C1', kind: 'assumption', claim: 'c', question: 'q?' }],
    journeys: [{ journey: 'j1', verdict: 'supported' }],
    frame_check: { fit: 'strong' },
  };
  const whole = { critic: 'anthropic-design', findings: [f('F1', 'a', { level: 'screen' }), f('F2', 'c')] };
  const lens = { critic: 'ia', findings: [f('I1', 'a')] };
  const out = carryFindings([
    { file: 'anthropic-design.json', data: whole },
    { file: 'anthropic-design-2.json', data: batch },
    { file: 'ia.json', data: lens },
  ], new Set(['a', 'c']), 'run-1');
  // The whole-view reviewer runs again on every screen, so only the batch carries.
  assert.deepEqual(out.map((o) => o.critic), ['anthropic-design-2']);
  const [b] = out.map((o) => o.data);
  assert.deepEqual(b.findings.map((x) => x.id), ['c2-F1']);
  for (const d of [b]) {
    assert.equal(d.critic, 'anthropic-design');
    assert.equal(d.method, 'carried from run-1');
    for (const k of ['tasks', 'challenges', 'journeys', 'frame_check', 'moves', 'scope']) assert.equal(d[k], undefined);
    assert.ok(d.findings.every((x) => x.carried_from === 'run-1'));
    const { errors } = validateCritique(d, { screens: new Set(['a', 'b', 'c']) });
    assert.deepEqual(errors, []);
  }
  assert.equal(batch.findings[0].carried_from, undefined, 'the source is not changed');
});

test('carry: a finding carried before keeps its first run, and ids stay unique', () => {
  const f = (id, extra = {}) => ({ id, screen: 'a', rule: 'NN-H4', severity: 'P3', title: id, evidence: 'e', recommendation: 'r', ...extra });
  const out = carryFindings([
    { file: 'anthropic-design-2.json', data: { critic: 'anthropic-design', findings: [f('F1')] } },
    { file: 'carried-anthropic-design-2.json', data: { critic: 'anthropic-design', findings: [f('F1', { carried_from: 'run-0' })] } },
  ], new Set(['a']), 'run-1');
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].data.findings.map((x) => [x.id, x.carried_from]), [['c2-F1', 'run-1'], ['F1', 'run-0']]);
});

test('carry: a run skips only unchanged screens a base batch looked at, and writes what it carried', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const base = makeRun(ids); const run = makeRun(ids);
  const f = path.join(run.dir, shot('b', CAPS[0]));
  const buf = fs.readFileSync(f); buf[0] ^= 1; fs.writeFileSync(f, buf);
  fs.mkdirSync(path.join(base.dir, 'briefs')); fs.mkdirSync(path.join(base.dir, 'critique'));
  // Base: batch 2 looked at a, b, c; d was only seen by the whole-view reviewer.
  fs.writeFileSync(path.join(base.dir, 'briefs', 'plan.json'), JSON.stringify({ stages: [[{ name: 'anthropic-design', screens: ids }, { name: 'anthropic-design-2', screens: ['a', 'b', 'c'] }]] }));
  const g = (id, screen) => ({ id, screen, rule: 'NN-H4', severity: 'P2', title: id, evidence: 'e', recommendation: 'r' });
  fs.writeFileSync(path.join(base.dir, 'critique', 'anthropic-design-2.json'), JSON.stringify({ critic: 'anthropic-design', findings: [g('F1', 'a'), g('F2', 'b')] }));
  fs.writeFileSync(path.join(base.dir, 'critique', 'anthropic-design.json'), JSON.stringify({ critic: 'anthropic-design', findings: [g('W1', 'c')] }));
  const r = carryRun({ runDir: run.dir, baseDir: base.dir, manifest: run.manifest, judged: ids });
  assert.deepEqual(r.skipped, ['a', 'c']);
  assert.deepEqual(r.changed, ['b', 'd']);
  assert.deepEqual(r.carried, { 'anthropic-design-2': 1 });
  const carried = JSON.parse(fs.readFileSync(path.join(run.dir, 'critique', 'carried-anthropic-design-2.json'), 'utf8'));
  assert.deepEqual(carried.findings.map((x) => [x.id, x.screen, x.carried_from]), [['c2-F1', 'a', path.basename(base.dir)]]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(run.dir, 'carry.json'), 'utf8')).skipped, ['a', 'c']);
  // One reviewer for every screen: nothing skipped, stale carried files removed.
  const one = carryRun({ runDir: run.dir, baseDir: base.dir, manifest: run.manifest, judged: null });
  assert.deepEqual(one.skipped, []);
  assert.ok(!fs.existsSync(path.join(run.dir, 'critique', 'carried-anthropic-design-2.json')));
});

test('carry: the planner gives skipped screens no batch, but the whole-view reviewer keeps them', () => {
  const screens = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, title: `S${i}`, platform: 'ios', captures: [{ platform: 'ios', device: 'standard', variant: 'light', screenshot: `x/s${i}.png` }] }));
  const plan = (skip) => planReviewers({ manifest: { screens, baseDir: '/p' }, runDir: '/r', pluginRoot: '/root', skip });
  const full = plan(new Set());
  const some = plan(new Set(screens.slice(0, 9).map((s) => s.id)));
  const batchesOf = (p) => p.reviewers.filter((r) => /^anthropic-design-\d+$/.test(r.name));
  assert.equal(batchesOf(full).length, 2);
  assert.deepEqual(batchesOf(some).map((r) => r.screens), [['s9', 's10', 's11']]);
  assert.equal(some.reviewers.find((r) => r.name === 'anthropic-design').screens.length, 12);
  assert.ok(some.estimate.tokens < full.estimate.tokens);
});

test('carry: a base finding across screens keeps those screens in a batch, so it is judged again', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const base = makeRun(ids); const run = makeRun(ids);
  fs.mkdirSync(path.join(base.dir, 'briefs')); fs.mkdirSync(path.join(base.dir, 'critique'));
  fs.writeFileSync(path.join(base.dir, 'briefs', 'plan.json'), JSON.stringify({ stages: [[{ name: 'anthropic-design-2', screens: ['a', 'b'] }, { name: 'anthropic-design-3', screens: ['c', 'd'] }]] }));
  const g = (id, screen, extra = {}) => ({ id, screen, rule: 'NN-H4', severity: 'P1', title: id, evidence: 'e', recommendation: 'r', ...extra });
  fs.writeFileSync(path.join(base.dir, 'critique', 'anthropic-design-2.json'), JSON.stringify({ critic: 'anthropic-design', findings: [g('F1', 'a', { level: 'flow', affected_screens: ['a', 'b'] })] }));
  fs.writeFileSync(path.join(base.dir, 'critique', 'anthropic-design-3.json'), JSON.stringify({ critic: 'anthropic-design', findings: [g('F2', 'c'), g('F3', 'd')] }));
  const r = carryRun({ runDir: run.dir, baseDir: base.dir, manifest: run.manifest, judged: ids });
  assert.deepEqual(r.skipped, ['c', 'd']);
  assert.deepEqual(r.kept, ['a', 'b']);
  // Ids carry their batch number, so two batches' carried findings don't collide.
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(run.dir, 'critique', 'carried-anthropic-design-3.json'), 'utf8')).findings.map((x) => x.id), ['c3-F2', 'c3-F3']);
  // A "*" finding in a batch keeps that whole batch.
  fs.writeFileSync(path.join(base.dir, 'critique', 'anthropic-design-3.json'), JSON.stringify({ critic: 'anthropic-design', findings: [g('F2', '*')] }));
  assert.deepEqual(carryRun({ runDir: run.dir, baseDir: base.dir, manifest: run.manifest, judged: ids }).skipped, []);
});

test('carry: screens past the whole-view limit are never skipped', () => {
  const screens = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, title: `S${i}`, platform: 'ios', captures: [{ platform: 'ios', device: 'standard', variant: 'light', screenshot: `x/s${i}.png` }] }));
  const p = planReviewers({ manifest: { screens, baseDir: '/p' }, runDir: '/r', pluginRoot: '/root', skip: new Set(screens.slice(36).map((s) => s.id)) });
  const batched = p.reviewers.filter((r) => /^anthropic-design-\d+$/.test(r.name)).flatMap((r) => r.screens);
  for (let i = 40; i < 50; i++) assert.ok(batched.includes(`s${i}`), `s${i} has a reviewer`);
  for (let i = 36; i < 40; i++) assert.ok(!batched.includes(`s${i}`));
});

test('carry: a carried finding raised again with the same title loses its carried mark', () => {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-carried-'));
  fs.mkdirSync(path.join(run, 'critique'));
  fs.writeFileSync(path.join(run, 'manifest.json'), JSON.stringify({ baseDir: run, gate: { fail_on: 'P1' }, screens: [{ id: 'home', title: 'Home', platform: 'ios', kind: 'image', captures: [] }] }));
  const f = (id, severity, extra = {}) => ({ id, screen: 'home', rule: 'NN-H4', basis: ['NN-H4'], category: 'ux', severity, title: 'Toggle wording is ambiguous', evidence: 'e', recommendation: 'r', ...extra });
  fs.writeFileSync(path.join(run, 'critique', 'carried-anthropic-design-2.json'), JSON.stringify({ critic: 'anthropic-design', findings: [f('c2-ad-1', 'P1', { carried_from: 'run-0' })] }));
  fs.writeFileSync(path.join(run, 'critique', 'anthropic-design.json'), JSON.stringify({ critic: 'anthropic-design', findings: [f('ad-1', 'P2')] }));
  const r = spawnSync(process.execPath, [path.resolve('scripts/report/render-report.mjs'), '--run', run, '--no-compare'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const all = JSON.parse(fs.readFileSync(path.join(run, 'findings.json'), 'utf8')).findings.filter((x) => x.title === 'Toggle wording is ambiguous');
  assert.equal(all.length, 1);
  assert.equal(all[0].carried_from, undefined);
});
