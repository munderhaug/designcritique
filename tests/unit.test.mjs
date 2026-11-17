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

import { assumptionsOf, section } from '../scripts/lib/framing.mjs';

test('framing: HTML comments are never read as content', () => {
  const md = '# App\n<!-- Tag statements [confirmed], [inferred] or [assumption]. -->\n\n## Users\n<!-- who -->\nNurses on night shifts [confirmed]\n\n## Evidence\n- Most use Android phones [assumption] (if not, the\n  iOS layout leads)\n<!-- - Commented [assumption] -->\n';
  assert.deepEqual(assumptionsOf(md), ['Most use Android phones [assumption] (if not, the iOS layout leads)']);
  assert.equal(section(md, 'Users'), 'Nurses on night shifts [confirmed]');
});

import { mergeAcrossSources, groupChecksByCause } from '../scripts/lib/merge.mjs';

test('merge: same problem from two critics, or a critic and a check, becomes one finding', () => {
  const f = [
    { id: 'ad-1', source: 'anthropic-design', screen: 'checkout', rule: 'IOS-DESTRUCTIVE', basis: ['IOS-DESTRUCTIVE', 'NN-H5'], severity: 'P1', title: 'Delete order looks the same as Pay now', element: { region: 'bottom action area' } },
    { id: 'imp-1', source: 'impeccable', screen: 'checkout', rule: 'IOS-DESTRUCTIVE', basis: ['IOS-DESTRUCTIVE'], severity: 'P2', title: 'Delete order is styled as a second primary button', element: { region: 'bottom action area' } },
    { id: 'ad-2', source: 'anthropic-design', screen: 'checkout', rule: 'NN-H9', basis: ['NN-H9'], severity: 'P1', title: 'Vague error' },
    { id: 'chk-1', source: 'check', screen: 'login', rule: 'CHK-TEXT-SCALE', basis: ['WCAG-1.4.4', 'IOS-TYPE'], severity: 'P1', title: 'Text does not scale' },
    { id: 'imp-3', source: 'impeccable', screen: 'login', rule: 'IOS-TYPE', basis: ['IOS-TYPE'], severity: 'P1', title: 'Login text is fixed in px' },
    { id: 'imp-4', source: 'impeccable', screen: 'login', rule: 'NN-H4', basis: ['NN-H4', 'IOS-TYPE'], severity: 'P2', title: 'Off-brand orange' },
  ];
  const out = mergeAcrossSources(f);
  assert.equal(out.length, 4);
  const del = out.find((x) => x.rule === 'IOS-DESTRUCTIVE');
  assert.deepEqual(del.raisedBy.sort(), ['anthropic-design', 'impeccable']);
  assert.equal(del.agreement, 'both-critics');
  assert.equal(del.severity, 'P1');
  assert.equal(del.also[0].evidence, undefined);
  const scale = out.find((x) => x.rule === 'CHK-TEXT-SCALE');
  assert.deepEqual(scale.raisedBy, ['check', 'impeccable']);
  assert.ok(out.some((x) => x.id === 'imp-4'), 'a critic citing the check principle only in its basis stays separate');
});

test('group: a check failing on many screens is reported once with the screen list', () => {
  const mk = (screen, rule, extra = {}) => ({ id: `chk-${screen}-${rule}`, source: 'check', screen, rule, basis: ['WCAG-2.5.8'], severity: 'P2', title: `x on ${screen}`, evidence: `e ${screen}`, raisedBy: ['check'], ...extra });
  const out = groupChecksByCause([
    mk('a', 'CHK-TARGET'), mk('b', 'CHK-TARGET', { severity: 'P1' }), mk('c', 'CHK-TARGET'),
    mk('a', 'CHK-SAFE-AREA', { cause: 'status bar' }), mk('b', 'CHK-SAFE-AREA', { cause: 'home indicator' }),
    mk('a', 'CHK-DARK'),
  ]);
  const t = out.find((f) => f.rule === 'CHK-TARGET');
  assert.equal(t.screen, '*');
  assert.deepEqual(t.screens, ['a', 'b', 'c']);
  assert.equal(t.severity, 'P1');
  assert.match(t.title, /3 screens/);
  assert.equal(out.filter((f) => f.rule === 'CHK-SAFE-AREA').length, 2);
  assert.equal(out.find((f) => f.rule === 'CHK-DARK').screen, 'a');
});

test('merge: differently worded findings on the same principle and place are one problem', () => {
  const out = mergeAcrossSources([
    { id: 'ad-9', source: 'anthropic-design', screen: 'welcome', rule: 'TELL-WEB-IDIOMS', basis: ['TELL-WEB-IDIOMS'], severity: 'P2', title: 'Website navigation on an iOS first-run screen', element: { region: 'top bar and footer' } },
    { id: 'imp-15', source: 'impeccable', screen: 'welcome', rule: 'TELL-WEB-IDIOMS', basis: ['TELL-WEB-IDIOMS'], severity: 'P2', title: 'Welcome is a ported marketing website', element: { region: 'top bar, feature cards and footer' } },
    { id: 'ad-3', source: 'anthropic-design', screen: 'welcome', rule: 'NN-H4', basis: ['NN-H4'], severity: 'P3', title: 'Icons mix styles', element: { region: 'feature cards' } },
    { id: 'imp-2', source: 'impeccable', screen: 'welcome', rule: 'NN-H4', basis: ['NN-H4'], severity: 'P3', title: 'Buttons differ from the kit', element: { region: 'call-to-action stack' } },
  ]);
  assert.equal(out.length, 3);
  assert.equal(out.find((f) => f.rule === 'TELL-WEB-IDIOMS').agreement, 'both-critics');
  assert.equal(out.filter((f) => f.rule === 'NN-H4').length, 2, 'distinct problems under one principle stay apart');
});

import { readProductStack } from '../scripts/lib/stack.mjs';

test('stack: web and Capacitor are recognised, React Native is not web', () => {
  const st = (s, p = 'adaptive') => readProductStack(`## Platform\n${p}\n\n## Stack\n${s}\n`).stacks.sort();
  assert.deepEqual(st('React + Capacitor + PWA'), ['capacitor', 'web']);
  assert.deepEqual(st('React Native with Expo'), ['expo', 'react-native']);
  assert.deepEqual(st('react-native'), ['react-native']);
  assert.deepEqual(st('Vue PWA'), ['web']);
  assert.deepEqual(st('<!-- SwiftUI | Compose | Expo --> undecided'), []);
  assert.ok(readProductStack('## Platform\nios\n\n## Stack\nPWA\n').platforms.includes('web'));
});

import { textScaleAdvice } from '../scripts/lib/advice.mjs';

test('text-size fix follows the stack', () => {
  assert.match(textScaleAdvice('ios', ['capacitor', 'web']), /-apple-system-body|text-zoom/);
  assert.match(textScaleAdvice('android', ['capacitor', 'web']), /WebView/);
  assert.match(textScaleAdvice('ios', ['web']), /Dynamic Type/);
  assert.match(textScaleAdvice('ios', []), /SwiftUI/);
  assert.match(textScaleAdvice('android', ['compose']), /sp in Compose/);
});

test('tokens: read from Markdown tables and lists when there is no front matter', () => {
  const file = tmp('DESIGN.md', `# Kit

## Colours
| Token | Light | Dark | Usage |
|---|---|---|---|
| \`surface\` | #FFFFFF | #121418 | Page background, 16px padding is not a token |
| on-surface | #16181D | #ECEEF3 | Body text |
| primary | rgb(36, 87, 214) | #8FB0FF | Buttons |

## Spacing
- xs: 4px
- s: 8px
- m: 16 px

## Typography
| Style | Size | Weight |
|---|---|---|
| Body | 17pt | Regular |
| Caption | 12pt | Regular |

## Radius
| Name | Value |
|--|--|
| card | 12px |
`);
  const t = loadTokens(file);
  assert.deepEqual(t.from, ['Markdown']);
  assert.equal(t.colorByName.get('surface'), '#ffffff');
  assert.equal(t.colorByName.get('dark-surface'), '#121418');
  assert.equal(t.colorByName.get('primary'), '#2457d6');
  assert.deepEqual(t.spacing, [4, 8, 16]);
  assert.deepEqual(t.fontSizes, [12, 17]);
  assert.deepEqual(t.radii, [12]);
  assert.equal(loadTokens(tmp('DESIGN.md', '# Kit\n\nNo tokens here.\n')), null);
});

import { productModel } from '../scripts/lib/product.mjs';

test('product model: journeys, concept model, scope, feature map, navigation', () => {
  const md = `# Bikes
## Journeys
<!-- 1. **example** (during): A → B -->
1. **report-crash** (must not fail, during, leads to repair): Home → Help → I had a crash → Send → Status
2. **repair** (after): Status -> Book repair -> Confirm

## Concept model
| Object | Relates to | Actions |
|---|---|---|
| Rider | bikes, trips | sign up, edit |
| Trip | rider; bike | start, end |

## Scope
### MVP
- Crash report
- Trips
### Later
- Group rides
### Out of scope
- Insurance sales

## Feature map
| Feature | Problem part | Key task | Phase | Seen as |
|---|---|---|---|---|
| Crash report | Not knowing what to do after a fall | Task 1 | MVP | Help, I had a crash |
| Ride history | Losing track of rides | Task 3 | v1 | Ride history |

## Navigation
1. Home
2. Trips (tab)
3. Help
`;
  const p = productModel(md);
  assert.equal(p.journeys.length, 2);
  assert.deepEqual(p.journeys[0], { id: 'report-crash', title: 'report-crash', critical: true, stage: 'during', leads_to: 'repair', steps: ['Home', 'Help', 'I had a crash', 'Send', 'Status'] });
  assert.deepEqual(p.journeys[1].steps, ['Status', 'Book repair', 'Confirm']);
  assert.deepEqual(p.concepts[1], { object: 'Trip', relations: ['rider', 'bike'], actions: ['start', 'end'], attributes: [] });
  assert.deepEqual(p.scope, { mvp: ['Crash report', 'Trips'], v1: [], later: ['Group rides'], out: ['Insurance sales'] });
  assert.deepEqual(p.features[0].seenAs, ['Crash report', 'Help', 'I had a crash']);
  assert.equal(p.features[1].phase, 'v1');
  assert.deepEqual(p.navigation, ['Home', 'Trips', 'Help']);
});

import { mentions, stateKindsOf, coverage, screenGraph, structureFindings } from '../scripts/lib/structure.mjs';

test('structure: mentions, state kinds, coverage, graph and continuity findings', () => {
  assert.ok(mentions('- button "Öffnungszeiten ändern"', 'öffnungszeiten ändern'), 'whole words in any script');
  assert.ok(!mentions('Tripadvisor', 'Trip'));
  assert.deepEqual(stateKindsOf('No rides yet'), ['empty']);
  assert.deepEqual(stateKindsOf('Noch keine Fahrten', '', loadVocabulary(['en', 'de'])), ['empty']);
  assert.deepEqual(stateKindsOf('- heading "Home"'), ['ideal']);
  const inventory = {
    states: [
      { id: 's01', title: 'Home', depth: 0, snapshot: 'Home Help Trips', actions: [{ label: 'Help', to: 's02' }, { label: 'Trips', to: 's03' }] },
      { id: 's02', title: 'Help', depth: 1, snapshot: 'I had a crash', actions: [{ label: 'I had a crash', to: 's04' }] },
      { id: 's03', title: 'Trips', depth: 1, snapshot: 'Trips Home', actions: [{ label: 'Home', to: 's01' }] },
      { id: 's04', title: 'Sent', depth: 2, snapshot: 'Sent', actions: [{ label: 'OK', to: 's04', effect: 'no visible change' }] },
    ],
    screens: [{ screenKey: 'a', title: 'Home', states: ['s01'] }, { screenKey: 'b', title: 'Help', states: ['s02'] }, { screenKey: 'c', title: 'Trips', states: ['s03'] }, { screenKey: 'd', title: 'Sent', states: ['s04'] }],
    transitions: [{ from: 's01', to: 's02', label: 'Help' }, { from: 's01', to: 's03', label: 'Trips' }, { from: 's02', to: 's04', label: 'I had a crash' }, { from: 's03', to: 's01', label: 'Home' }],
  };
  const model = {
    features: [{ feature: 'Crash report', seenAs: ['Crash report', 'I had a crash'], task: 'Task 1' }, { feature: 'Group rides', seenAs: ['Ride together'], task: '' }, { feature: 'Ride history', seenAs: ['Ride history'] }],
    journeys: [{ id: 'report-crash', critical: true, steps: ['Help', 'I had a crash', 'Send'], leads_to: 'repair' }, { id: 'repair', steps: ['Book repair', 'Confirm'] }],
    scope: { out: ['Insurance sales'] }, navigation: ['Home', 'Trips', 'Help'],
  };
  const screens = [{ id: 'home', title: 'Home', text: 'Home Help Trips Ride history Insurance sales', screenKey: 'a' }, { id: 'help', title: 'Help', text: 'I had a crash', screenKey: 'b' }];
  const journeysRun = [{ id: 'report-crash', title: 'Report a crash', critical: true, steps: ['Help', 'I had a crash', 'Send'], screens: ['j0', 'j1', 'j2'], brokenAt: 3, error: 'nothing visible named "Send"' }];
  const cov = coverage({ screens, model, journeysRun, inventory });
  assert.equal(cov.share, 2 / 3);
  assert.equal(cov.features.find((f) => f.feature === 'Ride history').reachable, false);
  assert.deepEqual(cov.journeys.map((j) => [j.id, j.scripted, j.completed]), [['report-crash', true, false], ['repair', false, false]]);
  const graph = screenGraph(inventory);
  const f = structureFindings({ model, cov, inventory, graph, journeysRun, startText: 'Home Help Trips', corpus: screens.map((s) => s.text).join('\n') });
  const rules = f.map((x) => x.rule).sort();
  assert.deepEqual(rules, ['CHK-DEAD-END', 'CHK-JOURNEY-BROKEN', 'CHK-NO-WAY-BACK', 'CHK-ORPHAN', 'CHK-SCOPE-OUT', 'CHK-SPEC-NAV-ORDER']);
  assert.equal(f.find((x) => x.rule === 'CHK-JOURNEY-BROKEN').severity, 'P0');
  assert.deepEqual(f.find((x) => x.rule === 'CHK-NO-WAY-BACK').affected.sort(), ['Help', 'Sent']);
});

import { navigationOf } from '../scripts/lib/structure.mjs';

test('structure: navigation order is read from the navigation landmark', () => {
  const snap = '- banner:\n  - heading "Home" [level=1]\n- main:\n  - paragraph: 12 items in stock\n- navigation "Main":\n  - button "Home"\n  - button "Plan"\n  - button "Stock"\n- contentinfo';
  assert.equal(navigationOf(snap), 'Home\nPlan\nStock');
  const model = { features: [], journeys: [], scope: {}, navigation: ['Home', 'Stock', 'Plan'] };
  const f = structureFindings({ model, cov: { features: [] }, startText: snap });
  assert.equal(f[0].rule, 'CHK-SPEC-NAV-ORDER');
  assert.match(f[0].evidence, /shows: Home, Plan, Stock/);
});

import { loadVocabulary, languagesOf } from '../scripts/lib/vocabulary.mjs';

test('vocabulary: per-language words, English always, project additions', () => {
  assert.deepEqual(languagesOf(['de-DE', 'no']), ['en', 'de', 'nb']);
  const en = loadVocabulary(['en']);
  assert.ok(en.avoid.test('Delete account'));
  assert.ok(!en.avoid.test('Deleted items'));
  assert.ok(en.back.test(' Back '));
  assert.ok(!en.back.test('Back to start'));
  assert.ok(en.states.partial.test('Step 2 of 5'));
  assert.ok(!en.states.empty.test('Tom Smith'));
  const de = loadVocabulary(['en', 'de'], { avoid: ['Archivieren'] });
  assert.ok(de.avoid.test('Konto löschen'));
  assert.ok(de.avoid.test('archivieren'));
  assert.ok(de.states.offline.test('Keine Verbindung'));
  assert.ok(de.states.partial.test('2 von 5'));
  assert.deepEqual(loadVocabulary(['en', 'xx']).unknown, ['xx']);
});

import { componentVariants, iconMeanings, parseGlossary, termUses, amountFormats, figuresThatDisagree } from '../scripts/lib/consistency.mjs';

test('consistency: component variants, icon meanings, glossary, formats, figures', () => {
  const accent = '#2457D6';
  const ctl = (screen, name, style, icon = null) => ({ screen, name, style, icon });
  const filled = { bg: '#2457d6', color: '#ffffff', border: null, radius: 12, weight: '600' };
  const v = componentVariants([
    ctl('a', 'Pay', filled), ctl('b', 'Save', filled),
    ctl('c', 'Open', { ...filled, radius: 999, weight: '700' }),
    ctl('d', 'Save', { bg: null, color: '#2457d6', border: '#2457d6', radius: 4, weight: '600' }),
    ctl('e', 'Menu', { bg: '#f3f5f9', color: '#16181d', border: null, radius: 12, weight: '400' }),
  ], accent);
  assert.equal(v.length, 3);
  assert.equal(v[0].count, 2);
  const icons = iconMeanings([ctl('a', 'Security', null, 'use:#shield'), ctl('b', 'Card lost', null, 'use:#shield'), ctl('c', 'Security', null, 'use:#shield'), ctl('d', 'Home', null, 'use:#home')]);
  assert.equal(icons.length, 1);
  assert.deepEqual(icons[0].meanings.map((m) => m.name), ['Security', 'Card lost']);
  const g = parseGlossary('# Guide\n\n## Glossary\n| Term | Meaning | Avoid |\n|---|---|---|\n| Account | Money | Wallet, Pocket |\n\n## Vale\nswap:\n  basket: cart\n');
  assert.deepEqual(g, [{ term: 'Account', avoid: ['Wallet', 'Pocket'] }, { term: 'cart', avoid: ['basket'] }]);
  assert.deepEqual(termUses([{ id: 'x', text: 'Open a wallet' }, { id: 'y', text: 'Accounts' }], g), [{ avoid: 'Wallet', use: 'Account', screens: ['x'] }]);
  const f = amountFormats([{ screen: 'a', text: 'Balance 1,240.00' }, { screen: 'b', text: 'Total 1 240,00 kr' }, { screen: 'c', text: 'Since 2024, card ends in 4821' }]);
  assert.deepEqual(f.map((x) => x.format).sort(), ['grouping comma, decimal dot', 'grouping space, decimal comma']);
  assert.deepEqual(f.find((x) => x.format.startsWith('grouping comma')).examples, ['1,240.00']);
  const d = figuresThatDisagree([
    { screen: 'home', family: 'h', text: 'Your money\nBalance 1,240.00\n3 accounts' },
    { screen: 'acc', family: 'a', text: 'Balance 1,204.00' },
    { screen: 'acc2', family: 'a', text: 'Balance 1,204.00' },
    { screen: 'x', family: 'x', text: 'Step 2' },
    { screen: 'y', family: 'y', text: 'Step 3' },
  ]);
  assert.equal(d.length, 1, 'small counters like "Step 2" may differ');
  assert.deepEqual(d[0].values.map((x) => x.value), ['1,240.00', '1,204.00']);
});

test('gate (review): dead ends on must-not-fail journeys, journey scores, feature coverage', () => {
  const g = normalizeGate({ fail_on: 'none', target_score: 8 });
  assert.equal(g.journey_target_score, 8);
  assert.equal(g.min_feature_coverage, 0.8);
  const crit = [{ id: 'card-lost', title: 'Card lost', screens: ['Help', 'Card lost', 'Card frozen'] }];
  const dead = { rule: 'CHK-DEAD-END', severity: 'P1', affected_screens: ['Card frozen'] };
  const r = evaluateGate({ findings: [dead], journeys: [{ journey: 'card-lost', score: 9, verdict: 'supported', source: 'a' }, { journey: 'card-lost', score: 6, verdict: 'at-risk', source: 'b' }], coverage: { share: 0.6 }, criticalJourneys: crit, critics: ['a'], tasks: [{ task: 't', score: 9, source: 'a' }] }, g);
  assert.equal(r.pass, false);
  assert.ok(r.reasons.some((x) => /must-not-fail journey "Card lost" has dead-end/.test(x)));
  assert.ok(r.reasons.some((x) => /journey "card-lost" scored 6/.test(x)));
  assert.ok(r.reasons.some((x) => /60% of the feature map/.test(x)));
  const ok = evaluateGate({ findings: [{ ...dead, affected_screens: ['Settings'] }], journeys: [{ journey: 'card-lost', score: 9, verdict: 'supported', source: 'a' }], coverage: { share: 0.9 }, criticalJourneys: crit, critics: ['a'], tasks: [{ task: 't', score: 9, source: 'a' }] }, g);
  assert.equal(ok.pass, true, ok.reasons.join('; '));
});

import { iaMapSvg, iaMapMermaid, rankProposals } from '../scripts/lib/review-report.mjs';

test('review report: IA map and ranked proposals', () => {
  const graph = { start: 'n1', nodes: [{ id: 'n1', title: 'Home', depth: 0, states: ['s1'], kind: 'screen' }, { id: 'n2', title: 'Help', depth: 1, states: ['s2'], kind: 'screen' }], edges: [{ from: 'n1', to: 'n2', labels: ['Help'] }] };
  const svg = iaMapSvg(graph, new Map([['Help', 'no way back']]));
  assert.match(svg, /<svg/);
  assert.match(svg, /class="node flagged"/);
  assert.match(iaMapMermaid(graph), /n1 -->\|"Help"\| n2/);
  const ranked = rankProposals({
    moves: [
      { item: 'Export statements', from: 'Advanced', to: 'Menu', reason: 'rarely needed but 4 taps deep', impact: 'low', source: 'ia' },
      { item: 'Card lost', from: 'Help', to: 'Home', reason: 'urgent', impact: 'high', source: 'ia' },
      { item: 'Card lost', from: 'Help', to: 'Home', reason: 'urgent', impact: 'high', source: 'system' },
    ],
    scope: [{ feature: 'Crypto trading', verdict: 'cut', reason: 'no job', source: 'scope' }, { feature: 'Accounts', verdict: 'keep', source: 'scope' }],
    decisions: [{ kind: 'proposal', item: 'Export statements', verdict: 'move', to: 'Menu', decision: 'reject', reason: 'rare' }],
  });
  assert.deepEqual(ranked.map((p) => [p.id, p.item, p.sources.length]), [['M2', 'Card lost', 2], ['S1', 'Crypto trading', 1], ['M1', 'Export statements', 1]]);
  assert.equal(ranked.find((p) => p.id === 'M1').decision.decision, 'reject');
});

test('tokens: DTCG aliases resolve and semantic roles keep their names', () => {
  const file = tmp('tokens.json', JSON.stringify({ color: { $type: 'color',
    primitive: { blue: { 500: { $value: '#3b82f6' } }, gray: { 900: { $value: '#111827' }, 50: { $value: '#f9fafb' } } },
    semantic: { primary: { $value: '{color.primitive.blue.500}' }, surface: { $value: '{color.primitive.gray.50}' }, 'on-surface': { $value: '{color.semantic.text}' }, text: { $value: '{color.primitive.gray.900}' }, loop: { $value: '{color.semantic.loop}' } } } }));
  const t = loadTokens(file);
  assert.equal(t.colorByName.get('primary'), '#3b82f6');
  assert.equal(t.colorByName.get('surface'), '#f9fafb');
  assert.equal(t.colorByName.get('on-surface'), '#111827', 'chains of aliases resolve');
  assert.ok(!t.colorByName.has('loop'), 'cycles are dropped, not looped');
  const md = tmp('DESIGN.md', '---\ncolors:\n  brand: "#2457D6"\n  primary: "{colors.brand}"\n---\n# X\n');
  assert.equal(loadTokens(md).colorByName.get('primary'), '#2457d6');
});

import { ethicsFindings } from '../scripts/lib/ethics.mjs';

test('ethics: pre-ticked consent, asymmetric choice, confirmshaming; none on a plain dialog', () => {
  const vocab = loadVocabulary(['en']);
  const c = (name, extra = {}) => ({ name, box: { x: 16, y: 600, w: 361, h: 50 }, style: { bg: null, size: 17, weight: '400' }, ...extra });
  const seeded = ethicsFindings({
    pageBg: '#ffffff', text: 'Get offers from our partners',
    interactive: [
      c('Send me offers by email', { type: 'checkbox', checked: true }),
      c('Accept all and continue', { style: { bg: '#2457d6', size: 17, weight: '600' } }),
      c("No thanks, I don't like saving money", { box: { x: 120, y: 670, w: 150, h: 20 }, style: { bg: null, size: 12, weight: '400' } }),
    ],
    vocab,
  });
  assert.deepEqual(seeded.map((f) => f.rule).sort(), ['CHK-ASYMMETRIC-CHOICE', 'CHK-CONFIRMSHAMING', 'CHK-PRESELECTED-CONSENT']);
  const plain = ethicsFindings({
    pageBg: '#ffffff', text: 'Delete this photo?',
    interactive: [c('Allow', { style: { bg: '#2457d6', size: 17, weight: '600' } }), c('Cancel', { box: { x: 16, y: 660, w: 80, h: 44 } }), c('Push notifications', { role: 'switch', checked: true })],
    vocab,
  });
  assert.equal(plain.length, 0, 'not a consent screen; notifications are not marketing consent');
});

import { compareJudgements } from '../scripts/lib/noise.mjs';

test('noise: task-score spread, verdict agreement and finding overlap between two judgements', () => {
  const f = (id, screen, rule, title, severity) => ({ id, screen, rule, basis: [rule], title, severity });
  const a = { tasks: [{ task: 'Pay', score: 3, verdict: 'blocked' }, { task: 'Log in', score: 6, verdict: 'at-risk' }], findings: [f('a1', 'checkout', 'IOS-DESTRUCTIVE', 'Delete looks like Pay', 'P1'), f('a2', 'login', 'NN-H9', 'Vague error', 'P2')] };
  const b = { tasks: [{ task: 'pay', score: 4, verdict: 'blocked' }, { task: 'Log in', score: 9, verdict: 'supported' }], findings: [f('b1', 'checkout', 'IOS-DESTRUCTIVE', 'Delete styled like Pay', 'P2'), f('b2', 'feed', 'NN-H1', 'No unread state', 'P3')] };
  const r = compareJudgements(a, b);
  assert.equal(r.meanScoreDiff, 2);
  assert.equal(r.maxScoreDiff, 3);
  assert.equal(r.verdictAgreement, 0.5);
  assert.deepEqual(r.findings, { a: 2, b: 2, both: 1, overlap: 1 / 3 });
  assert.equal(r.severityAgreement, 0);
});

test('detectors: every allowlisted rule cites principle IDs from the index', async () => {
  const { IMPECCABLE_RULES, UNSLOPOVICH_RULES } = await import('../scripts/lib/detectors.mjs');
  const { principleIds } = await import('../scripts/lib/validate.mjs');
  const known = principleIds();
  for (const [name, rule] of Object.entries({ ...IMPECCABLE_RULES, ...UNSLOPOVICH_RULES })) {
    for (const pl of [['ios'], ['android'], ['ios', 'android']]) {
      const basis = typeof rule.basis === 'function' ? rule.basis(pl) : rule.basis;
      assert.ok(basis.length, `${name} has no basis`);
      for (const id of basis) assert.ok(known.has(id), `${name} cites unknown ${id}`);
    }
  }
});

test('detectors: mapping by surface, platform, language and allowlist', async () => {
  const { mapDetectorFinding, collapseDetectorFindings, screenForFile, platformsOf } = await import('../scripts/lib/detectors.mjs');
  const ctx = { screen: 'home', platform: 'adaptive', english: true };
  assert.equal(mapDetectorFinding({ engine: 'impeccable', surface: 'rendered', rule: 'cream-palette' }, ctx), null, 'taste rules stay out');
  assert.equal(mapDetectorFinding({ engine: 'impeccable', surface: 'rendered', rule: 'low-contrast', snippet: '3.1:1 text #777 on #fff' }, ctx), null, 'axe covers solid fills');
  assert.ok(mapDetectorFinding({ engine: 'impeccable', surface: 'rendered', rule: 'low-contrast', snippet: '3.9:1 (gradient on section.hero)' }, ctx));
  assert.equal(mapDetectorFinding({ engine: 'unslopovich', surface: 'source', rule: 'oops-error' }, { ...ctx, english: false }), null, 'English phrase rules skip other languages');
  const swift = mapDetectorFinding({ engine: 'unslopovich', surface: 'source', rule: 'fixed-text-size', file: 'ios/A.swift', line: 3 }, ctx);
  assert.deepEqual(swift.basis, ['IOS-TYPE', 'WCAG-1.4.4']);
  assert.deepEqual(platformsOf('adaptive', 'res/layout/a.xml'), ['android']);
  assert.equal(swift.surface, 'source');
  assert.deepEqual(swift.element, { file: 'ios/A.swift', line: 3 });
  const one = collapseDetectorFindings([
    mapDetectorFinding({ engine: 'impeccable', surface: 'rendered', rule: 'skipped-heading', snippet: 'h1 then h3' }, ctx),
    mapDetectorFinding({ engine: 'impeccable', surface: 'source', rule: 'skipped-heading', file: 'home.html', snippet: 'h1 then h3' }, ctx),
  ]);
  assert.equal(one.length, 1);
  assert.equal(one[0].surface, 'rendered+source');
  const screens = [{ id: 'home', source: '/p/home.html', sourceFiles: ['/p/src/home'], hasSteps: false }];
  assert.equal(screenForFile('/p/home.html', screens).id, 'home');
  assert.equal(screenForFile('/p/src/home/View.swift', screens).id, 'home');
  assert.equal(screenForFile('/p/src/other.swift', screens), null);
});

test('merge: the same principle from the rendered screen and the source becomes one finding', async () => {
  const { mergeAcrossSources } = await import('../scripts/lib/merge.mjs');
  const axe = { id: 'a', source: 'check', screen: 'feed', rule: 'AXE-image-alt', basis: ['WCAG-1.1.1'], severity: 'P1', title: 'Images need alt text' };
  const code = { id: 'b', source: 'detector:unslopovich', surface: 'source', screen: 'feed', rule: 'UNSLOPOVICH-img-no-alt', basis: ['WCAG-1.1.1'], severity: 'P2', title: 'Image without alt text' };
  const other = { id: 'c', source: 'check', screen: 'feed', rule: 'CHK-TARGET', basis: ['IOS-TARGET'], severity: 'P2', title: 'Small target' };
  const twoChecks = { ...axe, id: 'd', rule: 'AXE-role-img-alt' };
  const out = mergeAcrossSources([axe, code, other, twoChecks]);
  const merged = out.find((f) => f.rule === 'AXE-image-alt');
  assert.deepEqual(merged.raisedBy, ['check', 'detector:unslopovich']);
  assert.equal(merged.agreement, 'rendered-and-source');
  assert.equal(merged.severity, 'P1');
  assert.ok(out.some((f) => f.id === 'd'), 'two findings of the same check never merge');
  assert.equal(out.length, 3);
});
