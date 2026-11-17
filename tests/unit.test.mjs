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
