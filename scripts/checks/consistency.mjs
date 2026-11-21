#!/usr/bin/env node
// System consistency across every captured screen: component variants, icons with two meanings,
// glossary terms, amount formats and figures that disagree. Writes checks/consistency.json
// (findings) and consistency.json (the inventory for the report).
//
// Usage: node scripts/checks/consistency.mjs --run <RUN_DIR>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs, readJson, writeJson } from '../lib/config.mjs';
import { loadTokens } from '../lib/tokens.mjs';
import { componentVariants, iconMeanings, parseGlossary, termUses, amountFormats, figuresThatDisagree } from '../lib/consistency.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: consistency.mjs --run <RUN_DIR>'); process.exit(2); }
const runDir = path.resolve(args.run);
const manifest = readJson(path.join(runDir, 'manifest.json'));
const tokens = manifest.designSnapshot ? loadTokens(path.join(runDir, manifest.designSnapshot)) : null;
const glossary = manifest.contentSnapshot ? parseGlossary(fs.readFileSync(path.join(runDir, manifest.contentSnapshot), 'utf8')) : [];

// One light, standard-size capture per screen; a screen's display name is its page title.
const controls = [];
const texts = [];
const titleOf = new Map();
for (const s of manifest.screens) {
  const cap = s.captures.find((c) => c.variant === 'light' && c.device === 'standard') || s.captures.find((c) => c.variant === 'light');
  if (!cap?.data || s.kind === 'native') continue; // a native hierarchy carries no styles or icons
  const raw = readJson(path.join(runDir, cap.data));
  // Only what a person can see: not content under an open sheet, covered or parked off-screen.
  const d = { ...raw, texts: raw.texts.filter((t) => !t.hidden), interactive: raw.interactive.filter((i) => !i.hidden) };
  const title = d.fingerprint?.title || s.title;
  titleOf.set(s.id, title);
  const family = d.fingerprint?.screenKey || s.id;
  for (const i of d.interactive) if (!i.disabled) controls.push({ screen: s.id, name: i.name, style: i.style, icon: i.icon });
  texts.push({ screen: s.id, family, text: [...d.texts.map((t) => t.text), ...d.interactive.map((i) => i.name)].join('\n') });
}
const names = (ids) => [...new Set(ids.map((id) => titleOf.get(id) || id))];

// The accent: the primary colour token, else the most common saturated control fill.
let accent = tokens?.colorByName.get('primary') || null;
if (!accent) {
  const counts = {};
  for (const c of controls) if (c.style?.bg && !c.style.bg.includes('@')) counts[c.style.bg] = (counts[c.style.bg] || 0) + 1;
  accent = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([hex]) => hex).find((hex) => {
    const m = hex.match(/^#(..)(..)(..)/); if (!m) return false;
    const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
    return Math.max(r, g, b) - Math.min(r, g, b) > 60;
  }) || null;
}

const variants = componentVariants(controls, accent);
const icons = iconMeanings(controls);
const terms = termUses(texts.map((t) => ({ id: t.screen, text: t.text })), glossary);
const formats = amountFormats(texts);
const figures = figuresThatDisagree(texts);

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const findings = [];
const add = (f) => findings.push({ id: `chk-consistency-${f.rule.toLowerCase().replace(/^chk-/, '')}-${hash(f.title)}`, source: 'check', confidence: 'high', screen: '*', level: 'system', ...f });
if (variants.length > 1) add({
  rule: 'CHK-COMPONENT-VARIANTS', basis: ['CONS-COMPONENT', 'NN-H4'], category: 'consistency', severity: 'P2',
  title: `${variants.length} styles for emphasised buttons`,
  affected_screens: names(variants.slice(1).flatMap((v) => v.screens)),
  evidence: variants.map((v) => `${v.signature}: ${v.count}× (e.g. ${v.examples.map((e) => `"${e}"`).join(', ')}) on ${names(v.screens).join(', ')}`).join('\n'),
  recommendation: 'Use one primary button component for the same role; keep the most used style and make the others match, or give a different role a deliberately different component.',
});
for (const ic of icons) add({
  rule: 'CHK-ICON-MEANING', basis: ['CONS-ICON', 'NN-H4'], category: 'consistency', severity: 'P2',
  title: `One icon, ${ic.meanings.length} meanings: ${ic.meanings.map((m) => `"${m.name}"`).join(', ')}`,
  affected_screens: names(ic.meanings.flatMap((m) => m.screens)),
  evidence: `${ic.icon} labels ${ic.meanings.map((m) => `"${m.name}" (${names(m.screens).join(', ')})`).join(' and ')}.`,
  recommendation: 'Give each meaning its own icon, or keep the icon for one meaning and label the other without it.',
});
if (terms.length) add({
  rule: 'CHK-TERM', basis: ['CONS-TERM', 'IA-LABEL'], category: 'consistency', severity: 'P2',
  title: `${terms.length} term(s) the content guide says to avoid`,
  affected_screens: names(terms.flatMap((t) => t.screens)),
  evidence: terms.map((t) => `"${t.avoid}" (use "${t.use}") on ${names(t.screens).join(', ')}`).join('\n'),
  recommendation: 'Use the glossary term everywhere the concept appears.',
});
if (formats.length > 1) add({
  rule: 'CHK-FORMAT', basis: ['CONS-FORMAT', 'NN-H4'], category: 'consistency', severity: 'P3',
  title: `${formats.length} formats for amounts`,
  affected_screens: names(formats.flatMap((f) => f.screens)),
  evidence: formats.map((f) => `${f.format}: ${f.examples.join(', ')} (${names(f.screens).join(', ')})`).join('\n'),
  recommendation: "Format numbers, currency and dates one way, following the locale's conventions.",
});
for (const fig of figures) add({
  rule: 'CHK-FIGURES-DISAGREE', basis: ['CONS-FIGURES', 'NORMAN-MODEL'], category: 'logic', severity: 'P2', confidence: 'medium',
  title: `"${fig.label}" shows ${fig.values.length} different values`,
  affected_screens: names(fig.values.flatMap((v) => v.screens)),
  evidence: fig.values.map((v) => `${v.value} on ${names(v.screens).join(', ')}`).join('\n'),
  recommendation: 'Show the same figure everywhere it appears, or label the figures so the difference is clear (for example "available" and "booked").',
});

const allIcons = new Map();
for (const c of controls) if (c.icon) { const e = allIcons.get(c.icon) || new Set(); if (c.name) e.add(c.name); allIcons.set(c.icon, e); }
writeJson(path.join(runDir, 'checks', 'consistency.json'), findings);
writeJson(path.join(runDir, 'consistency.json'), {
  accent, glossaryTerms: glossary.length,
  components: variants.map((v) => ({ ...v, screens: names(v.screens) })),
  icons: [...allIcons].map(([icon, n]) => ({ icon, meanings: [...n] })),
  terms: terms.map((t) => ({ ...t, screens: names(t.screens) })),
  formats: formats.map((f) => ({ ...f, screens: names(f.screens) })),
  figures,
});
console.log(`Consistency: ${findings.length} findings (${variants.length} emphasised button style(s), ${icons.length} icon(s) with two meanings, ${terms.length} avoided term(s), ${formats.length} amount format(s), ${figures.length} disagreeing figure(s))`);
