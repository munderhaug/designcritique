// Tooling failures kept apart from design findings, the critic contract, and the report renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { coverage, screenGraph, structureFindings, uncoveredStates } from '../scripts/lib/structure.mjs';
import { evaluateGate, findingOrigin } from '../scripts/lib/gate.mjs';
import { validateCritique, suggestIds, principleIds } from '../scripts/lib/validate.mjs';
import { extractJson, replyFromTranscript } from '../scripts/lib/extract-json.mjs';
import { productName } from '../scripts/lib/framing.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const model = { features: [], journeys: [], scope: { out: [] }, navigation: [] };

test('structure: a failed tap or replay is not a dead end or a missing way back', () => {
  const inventory = {
    states: [
      { id: 's01', title: 'Home', depth: 0, actions: [{ label: 'Open', to: 's02' }] },
      // Its exit timed out under a sheet: unknown, not "leads nowhere".
      { id: 's02', title: 'Sheet', depth: 1, actions: [{ label: 'Close', error: 'locator.click: Timeout 5000ms exceeded' }] },
      { id: 's03', title: 'Deep', depth: 2, unexplored: 'replay failed', replayError: 'step 6 failed', actions: [] },
    ],
    screens: [{ screenKey: 'a', title: 'Home', states: ['s01'] }, { screenKey: 'b', title: 'Sheet', states: ['s02'] }, { screenKey: 'c', title: 'Deep', states: ['s03'] }],
    transitions: [{ from: 's01', to: 's02', label: 'Open' }, { from: 's02', to: 's03', label: 'More' }],
  };
  const graph = screenGraph(inventory);
  const cov = coverage({ screens: [], model, inventory });
  const rules = structureFindings({ model, cov, inventory, graph }).map((f) => f.rule);
  assert.ok(!rules.includes('CHK-DEAD-END'), rules.join(', '));
  assert.ok(!rules.includes('CHK-NO-WAY-BACK'), rules.join(', '));
  assert.deepEqual(uncoveredStates(inventory).map((u) => u.state), ['s02', 's03']);
  assert.match(uncoveredStates(inventory)[1].reason, /replay failed: step 6/);

  // The same screen with a clean "no change" exit is a real dead end and has no way back.
  inventory.states[1].actions = [{ label: 'Close', to: 's02', effect: 'no visible change' }];
  inventory.states[2] = { id: 's03', title: 'Deep', depth: 2, actions: [{ label: 'OK', to: 's03', effect: 'no visible change' }] };
  const g2 = screenGraph(inventory);
  const rules2 = structureFindings({ model, cov, inventory, graph: g2 }).map((f) => f.rule);
  assert.ok(rules2.includes('CHK-DEAD-END') && rules2.includes('CHK-NO-WAY-BACK'), rules2.join(', '));
});

test('structure: several crawl starts, and screens reached by taps are not orphans', () => {
  const inventory = {
    starts: ['app', 'welcome'],
    states: [
      { id: 's01', title: 'Home', depth: 0, start: 'app', snapshot: 'Home', actions: [{ label: 'Help', to: 's02' }] },
      { id: 's02', title: 'Help', depth: 1, start: 'app', snapshot: 'Help', actions: [{ label: 'Back', to: 's01' }] },
      { id: 's03', title: 'Welcome', depth: 0, start: 'welcome', snapshot: 'Welcome', actions: [{ label: 'Next', to: 's03', effect: 'no visible change' }] },
    ],
    screens: [{ screenKey: 'a', title: 'Home', states: ['s01'] }, { screenKey: 'b', title: 'Help', states: ['s02'] }, { screenKey: 'c', title: 'Welcome', states: ['s03'] }],
    transitions: [{ from: 's01', to: 's02', label: 'Help' }, { from: 's02', to: 's01', label: 'Back' }],
  };
  const graph = screenGraph(inventory);
  assert.equal(graph.starts.length, 2);
  const m = { ...model, features: [{ feature: 'Onboarding', seenAs: ['Set up your household'] }] };
  const screens = [{ id: 'onboarding', title: 'Onboarding', text: 'Set up your household', screenKey: 'x', reachedByTaps: true }];
  const cov = coverage({ screens, model: m, inventory });
  assert.equal(cov.features[0].reachable, true);
  const rules = structureFindings({ model: m, cov, inventory, graph }).map((f) => f.rule);
  assert.ok(!rules.includes('CHK-ORPHAN'));
  assert.ok(!rules.includes('CHK-NO-WAY-BACK'), 'a start screen is its own way back');
});

test('gate: every reason says where it comes from', () => {
  const findings = [
    { severity: 'P1', source: 'check', raisedBy: ['check'] },
    { severity: 'P1', source: 'ia', raisedBy: ['ia'] },
    { severity: 'P1', source: 'check', raisedBy: ['check', 'impeccable'] },
  ];
  assert.equal(findingOrigin(findings[2]), 'check + critic');
  assert.equal(findingOrigin({ source: 'detector:impeccable' }), 'check');
  const r = evaluateGate({ findings }, { fail_on: 'P1', target_score: null });
  assert.deepEqual(r.reasons, ['[check] 1 open finding(s) at P1 or worse', '[check + critic] 1 open finding(s) at P1 or worse', '[critic] 1 open finding(s) at P1 or worse']);
});

test('critic contract: nearest IDs, the ID list in output-format.md, nullable fields', () => {
  assert.deepEqual(suggestIds('FITTS'), ['LAW-FITTS']);
  assert.deepEqual(suggestIds('GESTALT-FIGURE-GROUND'), ['GESTALT-FIGURE']);
  assert.deepEqual(suggestIds('UXCOPY-TONE'), ['COPY-TONE']);
  assert.deepEqual(suggestIds('WCAG-143'), ['WCAG-1.4.3']);
  assert.deepEqual(suggestIds('CALM-TECH'), []);

  const doc = fs.readFileSync(path.join(ROOT, 'skills/critique/references/output-format.md'), 'utf8');
  const listed = doc.split('<!-- ids:start -->')[1].split('<!-- ids:end -->')[0].match(/`([^`]+)`/g).map((x) => x.slice(1, -1));
  assert.deepEqual([...listed].sort(), [...principleIds()].sort(), 'output-format.md lists exactly the IDs in skills/principles/references');

  const data = {
    critic: 'scope',
    findings: [{ id: 's-1', screen: '*', rule: 'UXCOPY-LABELS', basis: ['UXCOPY-LABELS'], category: 'content', severity: 'P2', title: 't', evidence: 'e', recommendation: 'r' }],
    tasks: [{ id: 'T1', task: 'Pay', verdict: 'not-covered', score: null, coverage: 'partial' }],
    moves: [{ item: 'Help', from: null, to: 'Home', reason: 'often needed', impact: 'high', finding_id: null }],
    scope: [{ feature: 'Export', verdict: 'cut', finding_id: null }],
  };
  const v = validateCritique(data);
  assert.equal(v.errors.length, 2, v.errors.join('\n'));
  assert.ok(v.errors.every((e) => /did you mean COPY-ACTION-LABEL/.test(e)), v.errors.join('\n'));
  assert.ok(!v.warnings.some((w) => /no score/.test(w)), 'not-covered needs no score');
  data.moves[0].impact = 'Moving it saves two taps';
  assert.ok(validateCritique(data).errors.some((e) => /impact .*\(high, medium, low\)/.test(e)));
});

test('save-critique: JSON from a fenced reply or a transcript, stamped and validated', () => {
  const obj = { critic: 'x', findings: [{ id: 'a', note: 'has } and { inside' }] };
  assert.deepEqual(extractJson(`Here you go:\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`\nDone.`), obj);
  const transcript = [
    { type: 'user', message: { role: 'user', content: 'review' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Reading files' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: JSON.stringify(obj) }] } },
  ].map((e) => JSON.stringify(e)).join('\n');
  assert.deepEqual(extractJson(replyFromTranscript(transcript)), obj);

  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-save-'));
  fs.writeFileSync(path.join(run, 'manifest.json'), JSON.stringify({ screens: [{ id: 'home' }] }));
  const reply = { critic: 'whatever', findings: [], tasks: [{ id: 'T1', task: 'Pay', verdict: 'supported', score: 8, coverage: 'whole' }] };
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/report/save-critique.mjs'), '--run', run, '--critic', 'anthropic-design', '--name', 'anthropic-design-2', '--coverage', 'partial'], { input: `Result:\n${JSON.stringify(reply)}`, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const saved = JSON.parse(fs.readFileSync(path.join(run, 'critique', 'anthropic-design-2.json'), 'utf8'));
  assert.equal(saved.critic, 'anthropic-design');
  assert.equal(saved.tasks[0].coverage, 'partial', 'the orchestrator, not the critic, decides coverage');
});

test('product name for report titles comes from PRODUCT.md, never the folder', () => {
  assert.equal(productName('# Acme Pay\n\n## Users\n'), 'Acme Pay');
  assert.equal(productName('# Product\n\n## Name\n\nAcme Pay\n\n## Users\n'), 'Acme Pay');
  assert.equal(productName('# Product\n\n## Name\n\n<The product\'s name>\n'), null);
  assert.equal(productName('# Product\n\nEval Kit: a set of single screens.\n\n## Problem\n'), 'Eval Kit');
  assert.equal(productName('# Product\n\n## Product Purpose\n\nAcme — helps households prepare.\n'), 'Acme');
  assert.equal(productName('# Product\n\n## Users\n\nPeople.\n'), null);
});

test('render-report: a run with agreeing critics and a decided proposal renders (no TDZ crash), evidence is capped', () => {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-render-'));
  fs.mkdirSync(path.join(run, 'critique'));
  fs.mkdirSync(path.join(run, 'checks'));
  fs.mkdirSync(path.join(run, 'screenshots'));
  fs.writeFileSync(path.join(run, 'screenshots', 'home.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const base = path.join(run, 'project');
  fs.mkdirSync(path.join(base, '.designcritique'), { recursive: true });
  fs.writeFileSync(path.join(base, '.designcritique', 'decisions.yaml'), 'decisions:\n  - kind: proposal\n    item: Help\n    to: Home\n    decision: accept\n');
  fs.writeFileSync(path.join(run, 'framing.md'), '# Product\n\n## Name\n\nAcme Pay\n');
  fs.writeFileSync(path.join(run, 'manifest.json'), JSON.stringify({
    baseDir: base, framingSnapshot: 'framing.md', gate: { fail_on: 'P1' },
    screens: [{ id: 'home', title: 'Home', platform: 'ios', kind: 'image', captures: [{ platform: 'ios', device: 'image', deviceName: 'Static image', variant: 'as-provided', viewport: { width: 10, height: 10 }, screenshot: 'screenshots/home.png' }] }],
  }));
  const finding = (id, title, region) => ({ id, element: { region }, screen: 'home', rule: 'NN-H1', basis: ['NN-H1'], category: 'ux', severity: 'P2', title, evidence: Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'), recommendation: 'Show progress.' });
  fs.writeFileSync(path.join(run, 'critique', 'anthropic-design.json'), JSON.stringify({ critic: 'anthropic-design', findings: [finding('ad-1', 'No sign that payment is processing', 'bottom action area')] }));
  fs.writeFileSync(path.join(run, 'critique', 'impeccable.json'), JSON.stringify({ critic: 'impeccable', findings: [finding('imp-1', 'Payment gives no feedback while it runs', 'bottom action bar')] }));
  fs.writeFileSync(path.join(run, 'critique', 'ia.json'), JSON.stringify({ critic: 'ia', findings: [], moves: [{ item: 'Help', to: 'Home', reason: 'needed in a hurry', impact: 'high' }] }));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/report/render-report.mjs'), '--run', run, '--no-compare'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const md = fs.readFileSync(path.join(run, 'report.md'), 'utf8');
  assert.match(md, /^# Design critique: Acme Pay/m);
  assert.match(md, /raised by 2 critics/);
  assert.match(md, /and 22 more \(findings\.json has them all\)/);
  assert.doesNotMatch(md, /line 29/);
  assert.match(md, /Move \*\*Help\*\* to \*\*Home\*\*.*accepted by you/);
  const all = JSON.parse(fs.readFileSync(path.join(run, 'findings.json'), 'utf8'));
  assert.match(all.findings[0].evidence, /line 29/, 'findings.json keeps the whole evidence');
});

// ---------- gate trust: holes in the evidence, lost findings, decisions that reach too far ----------
import { parseKeyTasks } from '../scripts/lib/product.mjs';
import { repairPrincipleIds } from '../scripts/lib/validate.mjs';
import { applyDecisions, decisionFromFinding } from '../scripts/lib/decisions.mjs';
import { groupChecksByCause } from '../scripts/lib/merge.mjs';
import { analyzePage } from '../scripts/lib/analyze-page.mjs';
import { launch } from '../scripts/lib/browser.mjs';

test('key tasks are read from a bold or a plain numbered list', () => {
  const bold = parseKeyTasks('## Key Tasks\n\n1. **Pay for the order** (must not fail): When …\n2. **Track it**: When …\n');
  assert.deepEqual(bold.map((t) => [t.id, t.name, t.critical]), [['T1', 'Pay for the order', true], ['T2', 'Track it', false]]);
  const plain = parseKeyTasks('## Key Tasks\n\n1. Pay for the order (must not fail): when I am done choosing\n2) Track the delivery\n');
  assert.deepEqual(plain.map((t) => [t.id, t.name, t.critical]), [['T1', 'Pay for the order', true], ['T2', 'Track the delivery', false]]);
});

test('gate: missing or lost evidence fails it as a tooling reason', () => {
  const r = evaluateGate({ findings: [], incomplete: ['check step(s) failed and found nothing: detectors'] }, { fail_on: 'P1', target_score: null });
  assert.equal(r.pass, false);
  assert.deepEqual(r.reasons, ['[tooling] check step(s) failed and found nothing: detectors']);
});

test('a mistyped principle ID with one clear match is repaired, an unknown one is not', () => {
  const data = { critic: 'x', findings: [{ id: 'a', rule: 'FITTS', basis: ['FITTS', 'NN-H5'] }, { id: 'b', rule: 'CALM-TECH', basis: ['CALM-TECH'] }] };
  const repairs = repairPrincipleIds(data);
  assert.deepEqual(data.findings[0], { id: 'a', rule: 'LAW-FITTS', basis: ['LAW-FITTS', 'NN-H5'] });
  assert.equal(data.findings[1].rule, 'CALM-TECH');
  assert.deepEqual(repairs.map((r) => [r.finding, r.from, r.to]), [['a', 'FITTS', 'LAW-FITTS'], ['a', 'FITTS', 'LAW-FITTS']]);
});

test('dismissing a check grouped over screens covers those screens only', () => {
  const chk = (screen) => ({ id: `chk-${screen}-CHK-TARGET-1`, source: 'check', screen, rule: 'CHK-TARGET', severity: 'P1', title: 'Small target', evidence: 'x', basis: ['WCAG-2.5.8'], cause: null });
  const group = groupChecksByCause([chk('a'), chk('b')]).find((f) => f.screens);
  const d = decisionFromFinding(group, { decision: 'dismiss', reason: 'decorative' });
  assert.deepEqual(d.screens, ['a', 'b']);
  // Later: three more screens fail. They stay open; a and b stay dismissed.
  const later = groupChecksByCause(['a', 'b', 'c', 'd', 'e'].map(chk));
  const r = applyDecisions(later, [d]);
  assert.deepEqual(r.open.map((f) => f.screens), [['c', 'd', 'e']]);
  assert.match(r.open[0].title, /\(3 screens\)$/);
  assert.deepEqual(r.decided.map((f) => f.screens), [['a', 'b']]);
  // Later still: only one of the dismissed screens fails, ungrouped. Still dismissed.
  const one = applyDecisions([chk('a'), chk('z')], [d]);
  assert.deepEqual(one.open.map((f) => f.screen), ['z']);
});

test('structure: a control the crawler chose not to press is not a dead end or a missing way back', () => {
  const inventory = {
    states: [
      { id: 's01', title: 'Home', depth: 0, actions: [{ label: 'Checkout', to: 's02' }] },
      { id: 's02', title: 'Pay', depth: 1, actions: [{ label: 'Pay now', skipped: 'avoided (destructive or leaving)' }] },
      { id: 's03', title: 'More', depth: 1, actions: [{ label: 'Next', skipped: 'state limit reached' }] },
    ],
    screens: [{ screenKey: 'a', title: 'Home', states: ['s01'] }, { screenKey: 'b', title: 'Pay', states: ['s02'] }, { screenKey: 'c', title: 'More', states: ['s03'] }],
    transitions: [{ from: 's01', to: 's02', label: 'Checkout' }, { from: 's01', to: 's03', label: 'More' }],
  };
  const rules = structureFindings({ model, cov: coverage({ screens: [], model, inventory }), inventory, graph: screenGraph(inventory) }).map((f) => f.rule);
  assert.deepEqual(rules.filter((r) => /DEAD|WAY-BACK/.test(r)), []);
});

test('page analysis sees into web components and leaves out what a person cannot see', async (t) => {
  let browser;
  try { browser = await launch(); } catch { t.skip('no browser'); return; }
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await page.setContent(`<!doctype html><body style="margin:0;font:16px sans-serif">
      <div id="base" style="position:fixed;inset:0;background:#fff;padding:16px"><p>Base page text</p><button style="width:20px;height:20px">Under sheet</button></div>
      <div id="parked" style="position:fixed;inset:0;transform:translateX(100%);background:#fff"><p>Parked page text</p><button>Parked</button></div>
      <div role="dialog" aria-modal="true" style="position:fixed;left:0;right:0;bottom:0;height:60%;background:#fff;padding:16px">
        <p>Sheet text</p><x-btn>Shadow label</x-btn></div>
      <script>customElements.define('x-btn', class extends HTMLElement { connectedCallback() { this.attachShadow({ mode: 'open' }).innerHTML = '<button style="width:18px;height:18px;padding:0"><slot></slot></button><span style="font-size:6px">tiny shadow text</span>'; } });</script>`);
    const d = await page.evaluate(analyzePage, { frameAttr: null });
    const control = (name) => d.interactive.find((i) => i.name === name);
    assert.equal(control('Shadow label').hidden, null, 'a native control inside a shadow root is found, named by its host');
    assert.ok(control('Shadow label').box.w <= 18);
    assert.equal(control('Under sheet').hidden, 'under an open modal');
    assert.equal(control('Parked').hidden, 'under an open modal');
    assert.ok(d.texts.some((x) => x.text === 'tiny shadow text' && !x.hidden), 'text inside a shadow root is read');
    assert.equal(d.texts.find((x) => x.text === 'Base page text').hidden, 'under an open modal');
    // Without the sheet: the base page shows, the parked page is off-screen.
    await page.evaluate(() => document.querySelector('[role=dialog]').remove());
    const e = await page.evaluate(analyzePage, { frameAttr: null });
    assert.equal(e.interactive.find((i) => i.name === 'Under sheet').hidden, null);
    assert.equal(e.interactive.find((i) => i.name === 'Parked').hidden, 'off-screen');
    assert.equal(e.texts.find((x) => x.text === 'Parked page text').hidden, 'off-screen');
  } finally { await browser.close(); }
});
