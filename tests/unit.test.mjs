import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadTokens, contrastRatio } from '../scripts/lib/tokens.mjs';
import { designSystemFindings } from '../scripts/checks/design-system.mjs';
import { compareFindings } from '../scripts/lib/compare.mjs';
import { validateCritique } from '../scripts/lib/validate.mjs';

const tmp = (name, text) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-')), name); fs.writeFileSync(p, text); return p; };

test('contrast ratio matches WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff').toFixed(1), '21.0');
  assert.ok(Math.abs(contrastRatio('#767676', '#ffffff') - 4.54) < 0.02);
});

test('design-system checks flag weak token contrast, missing roles and an off-grid scale', () => {
  const file = tmp('DESIGN.md', '---\ncolors:\n  surface: "#FFFFFF"\n  on-surface: "#16181D"\n  on-surface-variant: "#A0A4AD"\n  primary: "#2457D6"\n  on-primary: "#FFFFFF"\ntypography:\n  font-sizes: [13, 17, 28]\nspacing: [4, 8, 10, 16]\n---\n# X\nButtons, forms, navigation, empty states and error states, voice and tone.\n');
  const f = designSystemFindings(loadTokens(file), file);
  const rules = f.map((x) => x.rule);
  assert.ok(rules.includes('CHK-DS-CONTRAST'));
  assert.equal(f.find((x) => x.rule === 'CHK-DS-CONTRAST').severity, 'P1');
  assert.ok(f.some((x) => x.rule === 'CHK-DS-ROLES' && /error/.test(x.title)));
  assert.ok(rules.includes('CHK-DS-SCALE'));
  assert.ok(!rules.includes('CHK-DS-ESSENTIALS'));
});

test('the eval tokens pass contrast and roles', () => {
  const f = designSystemFindings(loadTokens('evals/DESIGN.md'), 'evals/DESIGN.md');
  assert.ok(!f.some((x) => x.rule === 'CHK-DS-CONTRAST' || x.rule === 'CHK-DS-ROLES'));
});

test('run comparison: ids for checks, wording-tolerant matching for critics', () => {
  const base = [
    { id: 'chk-1', source: 'check', screen: 'a', rule: 'CHK-TARGET', title: 't', severity: 'P1' },
    { id: 'ad-1', source: 'anthropic-design', screen: 'a', rule: 'NN-H5', basis: ['NN-H5'], title: 'Delete styled like the pay button', severity: 'P1' },
    { id: 'ad-2', source: 'anthropic-design', screen: 'gone', rule: 'NN-H1', title: 'x', severity: 'P2' },
  ];
  const cur = [
    { id: 'ad-9', source: 'anthropic-design', screen: 'a', rule: 'NN-H5', basis: ['NN-H5'], title: 'Delete button styled like the pay button', severity: 'P2' },
    { id: 'chk-2', source: 'check', screen: 'a', rule: 'CHK-OVERFLOW', title: 'o', severity: 'P1' },
  ];
  const c = compareFindings(base, cur, new Set(['a']));
  assert.deepEqual(c.fixed.map((f) => f.id), ['chk-1']);
  assert.deepEqual(c.introduced.map((f) => f.id), ['chk-2']);
  assert.deepEqual(c.persisting.map((p) => p.before.id), ['ad-1']);
  assert.deepEqual(c.notRechecked.map((f) => f.id), ['ad-2']);
});

test('validation rejects unknown principle IDs, screens and severities', () => {
  const ok = JSON.parse(fs.readFileSync('evals/fixtures/sample-critique/anthropic-design.json', 'utf8'));
  assert.equal(validateCritique(ok, { screens: new Set(['checkout']) }).errors.length, 0);
  const bad = structuredClone(ok);
  Object.assign(bad.findings[0], { rule: 'MADE-UP', screen: 'nope', severity: 'High' });
  const { errors, badFindings } = validateCritique(bad, { screens: new Set(['checkout']) });
  assert.ok(errors.some((e) => /MADE-UP/.test(e)));
  assert.ok(errors.some((e) => /unknown screen/.test(e)));
  assert.ok(errors.some((e) => /severity/.test(e)));
  assert.ok(badFindings.has('ad-1'));
});

// ---------- review fixes ----------
import { spawnSync } from 'node:child_process';
import { idMatches, findingCites } from '../scripts/lib/match.mjs';
import { applyDecisions, decisionFromFinding, saveDecisions, loadDecisions } from '../scripts/lib/decisions.mjs';
import { evaluateGate } from '../scripts/lib/gate.mjs';
import { normalizeGate, expandImages } from '../scripts/lib/config.mjs';

const runHook = (file) => spawnSync(process.execPath, ['scripts/hooks/validate-critique-hook.mjs'], { input: JSON.stringify({ tool_input: { file_path: file } }), encoding: 'utf8' });

test('hook ignores critique/*.json outside a run, validates inside one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));
  fs.mkdirSync(path.join(dir, 'critique'));
  const file = path.join(dir, 'critique', 'config.json');
  fs.writeFileSync(file, '{"theme":"dark"}');
  assert.equal(runHook(file).status, 0);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ screens: [{ id: 'checkout' }] }));
  const r = runHook(file);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /critic/);
});

test('principle matching: exact or family, never a longer number', () => {
  assert.ok(idMatches('IOS-NAV-STACK', 'IOS-NAV'));
  assert.ok(idMatches('NN-H1', 'NN-H1'));
  assert.ok(!idMatches('NN-H10', 'NN-H1'));
  assert.ok(!idMatches('WCAG-1.4.11', 'WCAG-1.4.1'));
  assert.ok(findingCites({ rule: 'VIS-HIERARCHY', basis: ['VIS-HIERARCHY', 'WCAG-1.4.3'] }, 'WCAG-1.4.3'));
});

test('decisions: dismiss removes, severity re-rates, both survive a re-worded critic finding', () => {
  const before = { id: 'anthropic-design-ad-3', source: 'anthropic-design', screen: 'checkout', rule: 'NN-H10', title: 'No help link on the payment form', severity: 'P2' };
  const rerated = { id: 'anthropic-design-ad-1', source: 'anthropic-design', screen: 'checkout', rule: 'NN-H5', title: 'Delete order styled like Pay now', severity: 'P1' };
  const check = { id: 'chk-login-target-1', source: 'check', screen: 'login', rule: 'CHK-TARGET', title: 'Small target', severity: 'P1' };
  const decisions = [
    decisionFromFinding(before, { decision: 'dismiss', reason: 'Help is out of scope for v1' }),
    decisionFromFinding(rerated, { decision: 'severity', severity: 'P2', reason: 'Undo exists' }),
  ];
  const next = [
    { ...before, id: 'impeccable-x', title: 'Payment form has no help link' },
    { ...rerated, id: 'anthropic-design-ad-7' },
    check,
    { ...before, screen: 'login', id: 'other' },
  ];
  const { open, decided } = applyDecisions(next, decisions);
  assert.deepEqual(open.map((f) => f.id).sort(), ['anthropic-design-ad-7', 'chk-login-target-1', 'other']);
  assert.equal(open.find((f) => f.id === 'anthropic-design-ad-7').severity, 'P2');
  assert.equal(decided.length, 2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));
  saveDecisions(dir, decisions);
  assert.equal(loadDecisions(dir).length, 2);
});

test('gate: fails on severe findings and on the lowest task score', () => {
  const tasks = [{ task: 'Pay', score: 9, source: 'a' }, { task: 'Pay', score: 6, source: 'b' }, { task: 'Log in', score: 9, source: 'a' }];
  const g = normalizeGate({ fail_on: 'P1', target_score: 8 });
  const r = evaluateGate({ findings: [{ severity: 'P2' }], tasks, critics: ['a', 'b'] }, g);
  assert.equal(r.pass, false);
  assert.ok(r.reasons.some((x) => /"Pay" scored 6/.test(x)));
  assert.equal(evaluateGate({ findings: [{ severity: 'P2' }], tasks: tasks.slice(0, 1).concat(tasks[2]), critics: ['a'] }, g).pass, true);
  assert.equal(evaluateGate({ findings: [{ severity: 'P1' }], tasks: [], critics: [] }, normalizeGate({ target_score: null })).pass, false);
  assert.equal(evaluateGate({ findings: [{ severity: 'P1' }], tasks: [], critics: [] }, normalizeGate({ fail_on: 'none', target_score: null })).pass, true);
  assert.throws(() => normalizeGate({ fail_on: 'High' }));
});

test('taste: a folder expands to its images', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));
  for (const f of ['b.png', 'a.webp', 'notes.txt']) fs.writeFileSync(path.join(dir, f), '');
  assert.deepEqual(expandImages('.', dir).map((p) => path.basename(p)), ['a.webp', 'b.png']);
});

import { bestRound } from '../scripts/lib/gate.mjs';

test('iterate keeps the best round, not the last', () => {
  const run = (pass, sevs, scores) => ({
    gate: { pass },
    coverage: { critics: ['a'] },
    findings: sevs.map((severity) => ({ severity })),
    tasks: scores.map((score, i) => ({ task: `t${i}`, score, source: 'a' })),
  });
  const rounds = [
    { round: 1, merged: run(false, ['P1', 'P1', 'P2'], [5, 7]) },
    { round: 2, merged: run(false, ['P1', 'P2'], [6, 8]) },
    { round: 3, merged: run(false, ['P0', 'P2'], [8, 9]) },
  ];
  assert.equal(bestRound(rounds).round, 2);
  rounds.push({ round: 4, merged: run(true, ['P2', 'P2', 'P2'], [8, 8]) });
  assert.equal(bestRound(rounds).round, 4);
  assert.equal(bestRound([{ round: 2, merged: run(false, ['P1'], [6]) }, { round: 1, merged: run(false, ['P1'], [6]) }]).round, 1);
  const checksOnly = { ...run(false, [], []), coverage: { critics: [] } };
  assert.equal(bestRound([{ round: 1, merged: run(false, ['P1', 'P1'], [5]) }, { round: 2, merged: checksOnly }]).round, 1);
});

test('validation warns when a task score and verdict disagree', () => {
  const base = { critic: 'impeccable', findings: [] };
  const w = (t) => validateCritique({ ...base, tasks: [t] }).warnings;
  assert.equal(w({ task: 'Pay', verdict: 'blocked', score: 3 }).length, 0);
  assert.ok(w({ task: 'Pay', verdict: 'at-risk', score: 3 }).some((x) => /use blocked/.test(x)));
  assert.ok(w({ task: 'Pay', verdict: 'blocked', score: 6 }).length);
  assert.ok(w({ task: 'Pay', verdict: 'supported', score: 5 }).length);
});
