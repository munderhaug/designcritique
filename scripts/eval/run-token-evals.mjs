#!/usr/bin/env node
// Token-reader eval over a real corpus: the 150-odd DESIGN.md files of open-design (nexu-io,
// Apache-2.0) at a pinned commit. Measures how often the reader finds colours, the colour roles
// the design-system checks need, a type scale and a spacing scale, and fails below the
// thresholds. Also prints how the design-system checks fire across the corpus.
//
// Usage: node scripts/eval/run-token-evals.mjs [--dir <open-design checkout>] [--list missing-role]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../lib/config.mjs';
import { loadTokens } from '../lib/tokens.mjs';
import { designSystemFindings } from '../checks/design-system.mjs';
import fs from 'node:fs';
import YAML from 'yaml';
import os from 'node:os';
import { OPEN_DESIGN, openDesignSystems, designFiles } from '../lib/corpus.mjs';
import { mobileStartingPoint, PLATFORM } from '../lib/styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const systems = designFiles(openDesignSystems(root, args.dir));

// Share of systems the reader must handle. Raise them as the reader improves; never lower one
// to make a change pass.
// Systems that describe spacing only in words ("comfortable density mode", "8pt baseline grid")
// count as misses: there is no scale to read.
const THRESHOLDS = { parsed: 1, colours: 0.98, action: 0.85, surface: 0.95, text: 0.95, 'type scale': 0.8, 'spacing scale': 0.8 };
const ROLE = {
  action: /^(dark-)?(primary|accent|action|brand|interactive)$/,
  surface: /^(dark-)?(surface|background|bg|canvas)$/,
  text: /^(dark-)?(on-surface|on-background|text|foreground|fg|ink)$/,
};

const hits = Object.fromEntries(Object.keys(THRESHOLDS).map((k) => [k, []]));
const misses = Object.fromEntries(Object.keys(THRESHOLDS).map((k) => [k, []]));
const rules = new Map();
const insane = [];
for (const { id, file } of systems) {
  let t = null;
  try { t = loadTokens(file); } catch (e) { insane.push(`${id}: ${e.message}`); }
  const names = t ? [...t.colorByName.keys()] : [];
  const got = {
    parsed: !!t,
    colours: !!t && t.colors.size > 0,
    action: names.some((n) => ROLE.action.test(n)),
    surface: names.some((n) => ROLE.surface.test(n)),
    text: names.some((n) => ROLE.text.test(n)),
    'type scale': !!t && t.fontSizes.length >= 3,
    'spacing scale': !!t && t.spacing.length >= 3,
  };
  for (const [k, ok] of Object.entries(got)) (ok ? hits : misses)[k].push(id);
  if (!t) continue;
  // Values a reader should never produce from a design system.
  const bad = [...t.fontSizes.filter((v) => v < 6 || v > 400), ...t.spacing.filter((v) => v < 0 || v > 1000)];
  if (bad.length) insane.push(`${id}: out-of-range values ${bad.slice(0, 5).join(', ')}`);
  for (const f of designSystemFindings(t, file)) rules.set(f.rule, (rules.get(f.rule) || 0) + 1);
}

const n = systems.length;
let failed = false;
console.log(`open-design ${OPEN_DESIGN.commit.slice(0, 7)} (${OPEN_DESIGN.by}, ${OPEN_DESIGN.license}): ${n} DESIGN.md files\n`);
for (const [k, min] of Object.entries(THRESHOLDS)) {
  const rate = hits[k].length / n;
  const ok = rate >= min;
  if (!ok) failed = true;
  console.log(`${k.padEnd(14)} ${String(hits[k].length).padStart(4)}/${n}  ${(rate * 100).toFixed(1).padStart(5)}%  (min ${(min * 100).toFixed(0)}%)  ${ok ? 'pass' : 'FAIL'}`);
}
console.log('\nDesign-system checks across the corpus (systems flagged):');
for (const [rule, count] of [...rules].sort((a, b) => b[1] - a[1])) console.log(`  ${rule.padEnd(18)} ${count}`);
// Style starting points (catalog/styles.yaml): each must exist at the pinned commit.
const styles = YAML.parse(fs.readFileSync(path.join(root, 'catalog', 'styles.yaml'), 'utf8'));
const styleIds = Object.values(styles.families).flat();
const known = new Set(systems.map((x) => x.id));
const missingStyles = styleIds.filter((x) => !known.has(x));
if (styles.source.commit !== OPEN_DESIGN.commit) { failed = true; console.log('\ncatalog/styles.yaml pins a different commit than scripts/lib/corpus.mjs'); }
console.log(`\nStyle starting points: ${styleIds.length - missingStyles.length}/${styleIds.length} present${missingStyles.length ? `; missing ${missingStyles.join(', ')}` : ''}`);
if (missingStyles.length) failed = true;

// Each style, made into a phone-app starting point, must keep its colours and roles, take the
// platform's type scale, and carry no website layout (grids, max widths, breakpoints).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-styles-'));
const badStyles = [];
for (const id of styleIds.filter((x) => known.has(x))) {
  for (const platform of ['ios', 'android']) {
    const { text } = mobileStartingPoint(fs.readFileSync(path.join(path.dirname(systems[0].file), '..', id, 'DESIGN.md'), 'utf8'), platform);
    const file = path.join(tmpDir, `${id}-${platform}.md`);
    fs.writeFileSync(file, text);
    const t = loadTokens(file);
    const names = t ? [...t.colorByName.keys()] : [];
    const problems = [
      !t?.colors.size && 'no colours',
      !names.some((n) => ROLE.surface.test(n)) && 'no surface role',
      t && PLATFORM[platform].type.some((v) => !t.fontSizes.includes(v)) && 'type scale not the platform one',
      t && t.fontSizes.some((v) => !PLATFORM[platform].type.includes(v)) && 'web type sizes left',
      /\b(max-?width|breakpoint|12-col|desktop)\b/i.test(text.replace(/^## Visual Theme[\s\S]*?(?=^## )/m, '')) && 'website layout left',
    ].filter(Boolean);
    if (problems.length) badStyles.push(`${id} (${platform}): ${problems.join(', ')}`);
  }
}
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`Phone-app starting points: ${styleIds.length * 2 - badStyles.length}/${styleIds.length * 2} clean${badStyles.length ? `\n  ${badStyles.join('\n  ')}` : ''}`);
if (badStyles.length) failed = true;
if (insane.length) { failed = true; console.log(`\nReader errors:\n  ${insane.slice(0, 10).join('\n  ')}`); }
if (args.list && misses[args.list]) console.log(`\nMissing ${args.list}: ${misses[args.list].join(', ')}`);
process.exit(failed ? 1 : 0);
