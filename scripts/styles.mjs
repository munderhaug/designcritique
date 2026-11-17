#!/usr/bin/env node
// DESIGN.md starting points from generic style families (catalog/styles.yaml): open-design
// (nexu-io, Apache-2.0) at a pinned commit, fetched once into ~/.cache/designcritique.
//
//   node scripts/styles.mjs list [--dir <open-design checkout>]
//   node scripts/styles.mjs use <id> --platform ios|android [--out DESIGN.md] [--force]
//
// The styles were written for websites. `use` keeps what carries over to a phone app (intent,
// colour, font families, spacing scale, corner radii, voice), replaces the type sizes with the
// platform's, points layout, navigation, components and motion at the HIG or Material 3, adds an
// attribution notice and prints the design-system checks (scripts/lib/styles.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { parseArgs } from './lib/config.mjs';
import { loadTokens } from './lib/tokens.mjs';
import { designSystemFindings } from './checks/design-system.mjs';
import { OPEN_DESIGN, openDesignSystems } from './lib/corpus.mjs';
import { mobileStartingPoint } from './lib/styles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = YAML.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'styles.yaml'), 'utf8'));
const args = parseArgs(process.argv.slice(2));
const [cmd, id] = args._;

const allowed = new Map(Object.entries(catalog.families).flatMap(([family, ids]) => ids.map((x) => [x, family])));
if (catalog.source.commit !== OPEN_DESIGN.commit) {
  console.error('catalog/styles.yaml and scripts/lib/corpus.mjs pin different open-design commits; re-check the catalog.');
  process.exit(2);
}
const systems = () => openDesignSystems(ROOT, args.dir, path.join(os.homedir(), '.cache', 'designcritique'));
const summary = (text) => (text.split('\n').find((l) => /^>\s/.test(l) && !/^>\s*Category:/i.test(l)) || '').replace(/^>\s*/, '').trim();
const checks = (file) => {
  const t = loadTokens(file);
  return t ? designSystemFindings(t, file).filter((f) => f.rule !== 'CHK-DS-ESSENTIALS') : [];
};

if (cmd === 'list') {
  const dir = systems();
  for (const [family, ids] of Object.entries(catalog.families)) {
    console.log(`\n${family}`);
    for (const x of ids) {
      const file = path.join(dir, x, 'DESIGN.md');
      if (!fs.existsSync(file)) { console.log(`  ${x.padEnd(15)} (missing at this commit)`); continue; }
      const issues = checks(file).map((f) => `${f.rule.replace('CHK-', '')} ${f.severity}`);
      console.log(`  ${x.padEnd(15)} ${summary(fs.readFileSync(file, 'utf8')).slice(0, 90)}${issues.length ? `  [${issues.join(', ')}]` : ''}`);
    }
  }
  console.log(`\nFrom open-design (${catalog.source.by}, ${catalog.source.license}) at ${catalog.source.commit.slice(0, 7)}. Brackets: design-system checks to fix after choosing.`);
  process.exit(0);
}

if (cmd === 'use') {
  if (!id) { console.error('Usage: styles.mjs use <id> --platform ios|android [--out DESIGN.md] [--force]'); process.exit(2); }
  if (!allowed.has(id)) {
    console.error(`"${id}" is not a style family in catalog/styles.yaml. Systems modelled on a named company, product, game or person are not offered. Run: node scripts/styles.mjs list`);
    process.exit(2);
  }
  const platform = args.platform === 'android' ? 'android' : args.platform === 'ios' ? 'ios' : null;
  if (!platform) { console.error('Give --platform ios or android: the type scale and checks follow the platform.'); process.exit(2); }
  const out = path.resolve(args.out || 'DESIGN.md');
  if (fs.existsSync(out) && !args.force) { console.error(`${out} exists; pass --force to replace it, or --out another path.`); process.exit(2); }
  const src = path.join(systems(), id, 'DESIGN.md');
  const { text, kept, dropped } = mobileStartingPoint(fs.readFileSync(src, 'utf8'), platform);
  const notice = [
    '<!--',
    `Starting point: the "${id}" style family (${allowed.get(id)}) from open-design, ${catalog.source.repo}`,
    `(${catalog.source.path.replace('<id>', id)} at commit ${catalog.source.commit.slice(0, 7)}), by ${catalog.source.by},`,
    'licensed under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0).',
    `Changes for ${platform === 'ios' ? 'an iOS' : 'an Android'} app: kept ${kept.join(', ') || 'nothing'}; removed ${dropped.join(', ') || 'nothing'};`,
    'removed web type sizes, grids and breakpoints; added the platform type scale and a pointer to its guidelines.',
    '-->',
    '',
  ].join('\n');
  fs.writeFileSync(out, notice + text);
  const found = checks(out);
  console.log(`Wrote ${out} from the "${id}" style family (${allowed.get(id)}), for ${platform}.`);
  console.log(`Kept: ${kept.join(', ')}. Removed (website-specific): ${dropped.join(', ') || 'none'}.`);
  if (found.length) {
    console.log('\nFix these in the new DESIGN.md before critiquing against it:');
    for (const f of found) console.log(`  ${f.severity} ${f.title}\n     ${f.recommendation}`);
  } else console.log('Design-system checks: no problems in the tokens.');
  console.log('\nAdd dark values for every colour role, and say what the product sounds like (voice). The critique checks screens against this file.');
  process.exit(0);
}

console.error('Usage: styles.mjs list | use <id> --platform ios|android [--out DESIGN.md] [--force]');
process.exit(2);
