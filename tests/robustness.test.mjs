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
  // An agent that hands its final report back through a tool call, not as text.
  const handback = [
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x.json' } }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'SubagentHandback', input: { message: JSON.stringify(obj) } }] } },
  ].map((e) => JSON.stringify(e)).join('\n');
  assert.deepEqual(extractJson(replyFromTranscript(handback)), obj);

  const run =fs.mkdtempSync(path.join(os.tmpdir(), 'dc-save-'));
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
import { installPageHelpers } from '../scripts/lib/page-helpers.mjs';

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
    await installPageHelpers(page);
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

// ---------- sparring, generated briefs, Figma flows, native hierarchies ----------
import { planReviewers, judgedScreens, batches } from '../scripts/lib/briefs.mjs';
import { blindScreens, writeBlindSet, validateReading } from '../scripts/lib/blind.mjs';
import { figmaToInventory } from '../scripts/lib/figma.mjs';
import { hierarchyToData, flowFor, parseBounds } from '../scripts/lib/native.mjs';
import { normalizeGate } from '../scripts/lib/config.mjs';

const shot = (id) => ({ id, title: id, platform: 'ios', kind: 'html', source: `${id}.html`, captures: [{ platform: 'ios', device: 'standard', variant: 'light', screenshot: `screenshots/${id}.png` }, { platform: 'ios', device: 'standard', variant: 'dark', screenshot: `screenshots/${id}-dark.png` }] });

test('reviewer plan: stages, batches and coverage are decided by the script', () => {
  const ctx = (n, extra = {}) => ({
    manifest: { baseDir: '/p', framingSnapshot: 'framing.md', gate: { fail_on: 'P1', target_score: 8 }, screens: Array.from({ length: n }, (_, i) => shot(`s${i + 1}`)), ...extra },
    runDir: '/run', pluginRoot: '/plugin', keyTasks: [{ id: 'T1', name: 'Pay', critical: true }],
    companions: { impeccable: '/skills/impeccable/SKILL.md', 'design-critique': '/skills/dc/SKILL.md' }, blindKey: [{ n: 1, file: 'blind/01.png' }],
  });
  const small = planReviewers(ctx(5));
  assert.deepEqual(small.stages.map((st) => st.map((r) => r.name)), [['cold-read'], ['frame'], ['anthropic-design', 'impeccable']]);
  assert.equal(small.reviewers.find((r) => r.name === 'anthropic-design').coverage, 'whole');
  // The cold reader is told nothing: no frame, no screen ids, no titles.
  const cold = small.reviewers[0].brief;
  assert.ok(!/framing|s1\b|PRODUCT/.test(cold) && /blind\/01\.png/.test(cold));
  // Both critics get the same frame snapshot and the same evidence lines.
  for (const name of ['anthropic-design', 'impeccable']) {
    const b = small.reviewers.find((r) => r.name === name).brief;
    assert.match(b, /\/run\/framing\.md/); assert.match(b, /Reference screens/); assert.match(b, /T1 Pay \(must not fail\)/);
  }
  const big = planReviewers(ctx(20));
  const dr = big.reviewers.filter((r) => r.critic === 'anthropic-design');
  assert.deepEqual(dr.map((r) => [r.name, r.coverage]), [['anthropic-design', 'whole'], ['anthropic-design-2', 'partial'], ['anthropic-design-3', 'partial'], ['anthropic-design-4', 'partial']]);
  assert.ok(dr.slice(1).every((r) => / --coverage partial /.test(r.save)), 'the save command stamps a batch as partial');
  assert.equal(batches(Array.from({ length: 20 }), 8).map((b) => b.length).join(','), '8,8,4');
  // A review: one screen per family, journeys listed for the whole-view critics, lens reviewers added.
  const review = planReviewers({ ...ctx(0), familyOf: (s) => s.family, manifest: { baseDir: '/p', framingSnapshot: 'framing.md', inventory: 'inventory.json', journeys: [{ id: 'pay', title: 'Pay', critical: true, steps: ['Cart'], screens: ['journey--pay--0', 'journey--pay--1'] }], screens: [shot('app'), { ...shot('crawl--a'), inventoryState: 'a', family: 'f1' }, { ...shot('crawl--b'), inventoryState: 'b', family: 'f1' }, { ...shot('journey--pay--0'), journey: 'pay' }, { ...shot('journey--pay--1'), journey: 'pay' }] } });
  assert.equal(judgedScreens(review.reviewers.length ? { inventory: 'x', screens: [shot('app'), { ...shot('crawl--a'), inventoryState: 'a' }] } : {}, () => null).screens.length, 2);
  assert.deepEqual(review.stages[2].map((r) => r.name), ['anthropic-design', 'impeccable', 'ia', 'scope', 'system']);
  assert.equal(review.screens, 2, 'two crawl states of one family are judged once');
  assert.match(review.reviewers.find((r) => r.name === 'anthropic-design').brief, /Journeys lens[\s\S]*pay "Pay" \(must not fail\)/);
});

test('cold reading: numbered copies without names, and a usable shape', () => {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-blind-'));
  fs.mkdirSync(path.join(run, 'screenshots'));
  for (const id of ['checkout', 'login']) fs.writeFileSync(path.join(run, 'screenshots', `${id}.png`), 'x');
  const key = writeBlindSet(run, blindScreens({ screens: [shot('checkout'), shot('login')] }));
  assert.deepEqual(key.map((k) => k.file), ['blind/01.png', 'blind/02.png']);
  assert.deepEqual(fs.readdirSync(path.join(run, 'blind')).sort(), ['01.png', '02.png', 'key.json']);
  assert.deepEqual(validateReading({ product: 'A bank app', audience: 'Customers', problem: 'Seeing money', tasks: ['Check balance'], confidence: 'medium' }), []);
  assert.equal(validateReading({ product: '', tasks: 'x' }).length, 4);
});

test('gate can be turned off; challenges never count', () => {
  const off = normalizeGate('off');
  assert.equal(off.enabled, false);
  const r = evaluateGate({ findings: [{ severity: 'P0', source: 'ia' }] }, off);
  assert.equal(r.pass, true); assert.equal(r.off, true); assert.equal(r.reasons.length, 2, 'what would have counted is kept');
  const v = validateCritique({ critic: 'frame', findings: [], challenges: [{ id: 'c1', kind: 'assumption', claim: 'x', question: 'y?', basis: ['FRAME-ASSUMPTION'], confidence: 'low' }] });
  assert.deepEqual(v.errors, []);
  assert.ok(validateCritique({ critic: 'frame', findings: [], challenges: [{ id: 'c1', kind: 'assumption', claim: 'x', question: 'y?', severity: 'P1' }] }).warnings.some((w) => /no severity/.test(w)));
});

test('Figma prototype → navigation graph in the crawler\'s shape', () => {
  const text = (id, characters, extra = {}) => ({ id, type: 'TEXT', name: characters, characters, ...extra });
  const go = (destinationId, navigation = 'NAVIGATE') => [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId, navigation }] }];
  const file = { name: 'Bank', document: { children: [{
    id: '0:1', type: 'CANVAS', name: 'App', flowStartingPoints: [{ nodeId: '1:1', name: 'Main flow' }],
    children: [
      { id: '1:1', type: 'FRAME', name: 'Home', children: [text('1:2', 'Balance 1,240'), { id: '1:3', type: 'INSTANCE', name: 'Button', interactions: go('2:1'), children: [text('1:4', 'Help')] }, { id: '1:5', type: 'INSTANCE', name: 'Row', interactions: go('3:1', 'OVERLAY'), children: [text('1:6', 'Menu')] }] },
      { id: '2:1', type: 'FRAME', name: 'Help', children: [text('2:2', 'Card lost', { interactions: go('4:1') }), { id: '2:3', type: 'FRAME', name: 'Back', interactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'BACK' }] }] }] },
      { id: '3:1', type: 'FRAME', name: 'Menu', children: [text('3:2', 'Terms', { interactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'URL', url: 'https://example.com' }] }] })] },
      { id: '4:1', type: 'FRAME', name: 'Card frozen', children: [text('4:2', 'Your card is frozen')] },
      { type: 'SECTION', id: '9:0', name: 'Old', children: [{ id: '9:1', type: 'FRAME', name: 'Monthly', transitionNodeID: '1:1', children: [text('9:2', 'Monthly summary')] }] },
    ],
  }] } };
  const r = figmaToInventory(file);
  assert.deepEqual(r.inventory.states.map((s) => [s.title, s.depth, s.kind]), [['Home', 0, 'screen'], ['Help', 1, 'screen'], ['Menu', 1, 'sheet'], ['Card frozen', 2, 'screen']]);
  assert.deepEqual(r.unreachable, ['Monthly'], 'a frame no flow leads to');
  assert.deepEqual(r.mockups.find((m) => m.id === 'card-frozen'), { id: 'card-frozen', title: 'Card frozen', file: 'figma/card-frozen.png', flow: 'main-flow', step: 3, figma_node: '4:1' });
  // The structure checks read it like a crawl: Help has a way back, Card frozen is a dead end
  // with none, and Menu's only control leaves the app.
  const graph = screenGraph(r.inventory);
  const f = structureFindings({ model, cov: coverage({ screens: [], model, inventory: r.inventory }), inventory: r.inventory, graph });
  assert.deepEqual(f.find((x) => x.rule === 'CHK-DEAD-END').affected, ['Card frozen']);
  assert.deepEqual(f.find((x) => x.rule === 'CHK-NO-WAY-BACK').affected.sort(), ['Card frozen', 'Menu']);
});

test('native hierarchy → the data the checks read; a Maestro flow from taps', () => {
  assert.deepEqual(parseBounds('[0,66][1080,210]'), { x: 0, y: 66, w: 1080, h: 144 });
  const tree = { attributes: { bounds: '[0,0][1080,2400]' }, children: [
    { attributes: { bounds: '[40,200][520,340]', text: 'Pay now', class: 'android.widget.Button', clickable: 'true', enabled: 'true' }, children: [] },
    { attributes: { bounds: '[900,200][990,290]', class: 'android.widget.ImageButton', clickable: 'true', 'resource-id': 'com.x:id/close' }, children: [] },
    { attributes: { bounds: '[40,400][1040,560]', class: 'android.view.ViewGroup' }, clickable: true, children: [{ attributes: { bounds: '[60,420][600,480]', text: 'Order summary', class: 'android.widget.TextView' }, children: [] }] },
  ] };
  const d = hierarchyToData(tree, { scale: 3 });
  assert.deepEqual(d.viewport, { width: 360, height: 800 });
  assert.deepEqual(d.interactive.map((i) => [i.name, i.box.w, i.box.h]), [['Pay now', 160, 47], ['', 30, 30], ['Order summary', 333, 53]]);
  assert.equal(d.interactive[1].selector, 'com.x:id/close');
  assert.equal(flowFor('com.x', ['Cart', 'Pay "now"']), 'appId: com.x\n---\n- launchApp:\n    clearState: true\n- waitForAnimationToEnd\n- tapOn: "Cart"\n- waitForAnimationToEnd\n- tapOn: "Pay \\"now\\""\n- waitForAnimationToEnd\n');
});

// What a reviewer or the orchestrating model must load stays small (tokens ≈ bytes / 4): a
// long skill is read by every reviewer on every run, and a long file is where an agent's edits
// go wrong. Detail belongs in references/, loaded on demand (CLAUDE.md).
test('skills, agents and reference files stay within their size budgets', () => {
  const tokens = (f) => Math.round(fs.statSync(f).size / 4);
  const list = (dir, pick) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(path.join(dir, e.name), pick) : pick(e.name) ? [path.join(dir, e.name)] : []));
  const over = [];
  for (const f of [...list('skills', (n) => n === 'SKILL.md'), ...list('agents', (n) => n.endsWith('.md')), ...list('commands', (n) => n.endsWith('.md'))]) if (tokens(path.join(ROOT, f)) > 2500) over.push(`${f}: ${tokens(path.join(ROOT, f))} (max 2500)`);
  for (const f of list('skills', (n) => n.endsWith('.md') && n !== 'SKILL.md')) if (tokens(path.join(ROOT, f)) > 3500) over.push(`${f}: ${tokens(path.join(ROOT, f))} (max 3500)`);
  // Scripts: a soft ceiling that catches a file growing into the next render-report.
  for (const f of list('scripts', (n) => n.endsWith('.mjs'))) if (tokens(path.join(ROOT, f)) > 7500) over.push(`${f}: ${tokens(path.join(ROOT, f))} (max 7500): split it`);
  assert.deepEqual(over, []);
});

test('gate.confirm: a finding one critic raised alone does not block; a P0 or a confirmed one does', () => {
  const findings = [
    { severity: 'P1', source: 'ia', raisedBy: ['ia'] },
    { severity: 'P1', source: 'anthropic-design', raisedBy: ['anthropic-design', 'impeccable'] },
    { severity: 'P0', source: 'ia', raisedBy: ['ia'] },
    { severity: 'P1', source: 'check', raisedBy: ['check'] },
  ];
  const strict = evaluateGate({ findings }, { fail_on: 'P1', target_score: null });
  assert.deepEqual(strict.reasons, ['[check] 1 open finding(s) at P1 or worse', '[critic] 3 open finding(s) at P1 or worse']);
  const confirm = evaluateGate({ findings }, { fail_on: 'P1', target_score: null, confirm: true });
  assert.deepEqual(confirm.reasons, ['[check] 1 open finding(s) at P1 or worse', '[critic] 2 open finding(s) at P1 or worse']);
  assert.equal(confirm.unconfirmed, 1);
});

import { inputPurposeProblems, focusOrderProblems, lix } from '../scripts/lib/form-checks.mjs';
import { mergeAcrossSources as mergeAll, EQUIVALENT } from '../scripts/lib/merge.mjs';

test('fields say what they collect; an account name is not a person\'s name', () => {
  const f = (o) => ({ type: 'text', key: '', name: '', autocomplete: null, inputmode: null, hidden: null, ...o });
  const out = inputPurposeProblems([
    f({ type: 'email', key: 'email' }),                               // no autocomplete
    f({ key: 'phone' }),                                              // no autocomplete, text keyboard
    f({ type: 'email', key: 'email', autocomplete: 'email' }),        // fine
    f({ key: 'name', name: 'Account name' }),                         // not about the person
    f({ type: 'password', key: 'pw', autocomplete: 'off' }),          // off is not an answer
    f({ type: 'email', key: 'email', hidden: 'under an open modal' }), // not on screen
  ]);
  assert.deepEqual(out.map((p) => [p.field.key, p.missing.join('+')]), [['email', 'autocomplete'], ['phone', 'autocomplete+keyboard'], ['pw', 'autocomplete']]);
});

test('focus order: jumps back up the screen and forced tab order; reading ease by LIX', () => {
  const c = (name, y, extra = {}) => ({ name, tag: 'button', box: { x: 0, y, w: 100, h: 44 }, hidden: null, fixed: false, disabled: false, tabindex: null, ...extra });
  assert.equal(focusOrderProblems([c('a', 100), c('b', 160), c('c', 160), c('d', 300)]).jumps.length, 0);
  const bad = focusOrderProblems([c('a', 400), c('b', 100), c('c', 500), c('d', 60), c('tab', 800, { fixed: true }), c('first', 20, { tabindex: 3 })]);
  assert.equal(bad.jumps.length, 2);
  assert.deepEqual(bad.forced.map((x) => x.name), ['first']);
  assert.equal(lix('Short text.'), null);
  const easy = lix(Array.from({ length: 20 }, () => 'You can pay now. It is safe.').join(' '));
  const hard = lix(Array.from({ length: 6 }, () => 'Notwithstanding aforementioned considerations regarding transactional authorisation procedures, cardholders acknowledge institutional responsibilities concerning unauthorised disbursements').join(' ') + '.');
  assert.ok(easy.score < 30 && hard.score > 60, `${easy.score} ${hard.score}`);
  assert.equal(lix('支付按钮太小'.repeat(40)), null);
});

test('two critics citing different IDs for one defect merge; every equivalent ID exists', () => {
  const ids = principleIds();
  for (const id of EQUIVALENT.flat()) assert.ok(ids.has(id), `${id} is not in the principles index`);
  const out = mergeAll([
    { id: 'a', source: 'anthropic-design', screen: 'pay', rule: 'NN-H9', basis: ['NN-H9'], severity: 'P1', title: 'The payment error does not say what went wrong' },
    { id: 'b', source: 'impeccable', screen: 'pay', rule: 'COPY-ERROR', basis: ['COPY-ERROR'], severity: 'P2', title: 'Payment error message does not say what went wrong or how to fix it' },
    { id: 'c', source: 'impeccable', screen: 'pay', rule: 'LAW-FITTS', basis: ['LAW-FITTS'], severity: 'P2', title: 'Close button is tiny' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out.find((f) => f.rule === 'NN-H9').agreement, 'critics-agree');
});

import { amountFormats as formatsOf } from '../scripts/lib/consistency.mjs';
test('a phone number is not a second amount format', () => {
  const f = formatsOf([{ screen: 'a', text: 'Balance 1,240.00' }, { screen: 'b', text: 'Call us on 0800 000 000 or 020 7946 0000' }, { screen: 'c', text: 'Spent 1,120.00' }]);
  assert.deepEqual(f.map((x) => x.format), ['grouping comma, decimal dot']);
  assert.equal(formatsOf([{ screen: 'a', text: '1,240.00' }, { screen: 'b', text: '1 240,00' }]).length, 2);
});

test('connections: lists what needs the designer, and leads with what the project uses', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-conn-'));
  fs.writeFileSync(path.join(dir, 'mockups.yaml'), 'mockups:\n  - id: a\n    file: a.png\nnative:\n  - id: shop\n    app: com.example.shop\n');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/connections.mjs'), '--project', dir, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const items = JSON.parse(r.stdout).items;
  assert.deepEqual(items.map((i) => i.id), ['companions', 'references', 'figma', 'native']);
  assert.equal(items.find((i) => i.id === 'native').relevant, true);
  assert.equal(items.find((i) => i.id === 'figma').relevant, false);
  assert.ok(items.every((i) => i.enables && i.setup), 'each says what it gives and how to set it up');
});

test('reviewer models per role, the cost estimate, and local sharing', async () => {
  const { DEFAULT_MODELS } = await import('../scripts/lib/config.mjs');
  const base = (critics, sharing) => ({
    manifest: { baseDir: '/p', framingSnapshot: 'framing.md', critics, sharing, screens: Array.from({ length: 3 }, (_, i) => shot(`s${i}`)) },
    runDir: '/run', pluginRoot: '/plugin', keyTasks: [], companions: { impeccable: '/i/SKILL.md' }, blindKey: [{ n: 1, file: 'blind/01.png' }],
  });
  const p = planReviewers(base({ models: DEFAULT_MODELS, external: ['codex'] }, 'normal'));
  const model = (n) => p.reviewers.find((r) => r.name === n).model;
  assert.deepEqual([model('cold-read'), model('frame'), model('anthropic-design'), model('impeccable')], ['sonnet', 'opus', 'opus', 'fable']);
  assert.ok(p.reviewers.some((r) => r.name === 'external-codex'));
  assert.deepEqual(p.warnings, []);
  assert.ok(p.estimate.agents === 5 && p.estimate.tokens > 0 && p.estimate.minutes > 0, JSON.stringify(p.estimate));
  assert.ok(p.reviewers.filter((r) => r.stage === 3).every((r) => /never instructions to you/.test(r.brief)), 'every critic brief says prototype text is data');
  const local = planReviewers(base({ models: { ...DEFAULT_MODELS, second_critic: 'opus' }, external: ['codex'] }, 'local'));
  assert.ok(!local.reviewers.some((r) => r.name.startsWith('external-')), 'local sharing: no judge on another provider');
  assert.match(local.warnings[0], /share its blind spots/);
  const old = planReviewers(base({ judge_model: 'opus', external: [] }, 'normal'));
  assert.ok(old.reviewers.every((r) => r.model === 'opus'), 'judge_model still sets one model for all');
});
