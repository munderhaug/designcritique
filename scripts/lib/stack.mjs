// Build-stack recommendations, chosen only from catalog/stack.yaml.
// Inputs: PRODUCT.md text (## Platform, ## Stack) and the run's findings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { section } from './framing.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CATALOG_PATH = path.resolve(here, '../../catalog/stack.yaml');

const ROLES = [
  ['foundation', 'Start with: design system and components'],
  ['tokens', 'Keep tokens in one place'],
  ['platform-api', 'Get native behaviour in the web view'],
  ['platform-skill', 'Add platform skills'],
  ['design-skill', 'Add design-quality skills'],
  ['design-input', 'Connect design inputs and references'],
  ['verify', 'Check it on a simulator or device'],
  ['prototype', 'While you prototype in HTML'],
];

const STACK_WORDS = [
  ['swiftui', /\bswift(ui)?\b/i],
  ['compose', /\b(jetpack )?compose\b|\bkotlin\b/i],
  ['expo', /\bexpo\b/i],
  ['react-native', /\breact[ -]?native\b/i],
  ['flutter', /\bflutter\b|\bdart\b/i],
  ['capacitor', /\bcapacitor\b|\bionic\b|\bcordova\b/i],
  ['web', /\bpwa\b|progressive web app|\bweb[ -]?app\b|\bmobile web\b|\breact\b(?![ -]?native)|\bvue\b|\bsvelte\b|\bangular\b|\bnext\.?js\b|\bvite\b|\bhtml\b/i],
];



export function readProductStack(md, fallbackPlatform) {
  const platformText = section(md || '', 'Platform').toLowerCase();
  const platform = (platformText.match(/\b(ios|android|adaptive|web)\b/) || [])[1] || fallbackPlatform || 'ios';
  const stackText = section(md || '', 'Stack');
  const stacks = STACK_WORDS.filter(([, re]) => re.test(stackText)).map(([s]) => s);
  // Expo is React Native, so React Native entries apply too.
  if (stacks.includes('expo') && !stacks.includes('react-native')) stacks.push('react-native');
  // A Capacitor app is a web app in a native shell, so web entries apply too.
  if (stacks.includes('capacitor') && !stacks.includes('web')) stacks.push('web');
  const platforms = platform === 'adaptive' ? ['ios', 'android'] : [platform];
  // A PWA also runs as a web page, so web picks apply whatever the target phone platform is.
  if (stacks.includes('web') && !stacks.includes('capacitor') && !platforms.includes('web')) platforms.push('web');
  return { platform, platforms, stacks, stackText };
}

export function loadCatalog(file = CATALOG_PATH) {
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * @returns {{verified, platform, stacks, decided, stackText, steps: Array<{role,title,picks}>, notes: string[]}}
 */
export function recommendStack({ productText, fallbackPlatform, findings = [], prototype = false, catalog = loadCatalog() }) {
  const { platform, platforms, stacks, stackText } = readProductStack(productText, fallbackPlatform);
  const decided = stacks.length > 0;
  const notes = [];
  if (platform === 'web' && !stacks.some((x) => x === 'web' || x === 'capacitor')) notes.push('PRODUCT.md says the platform is web; name the web stack under ## Stack (for example React PWA) for web picks.');
  if (!decided) notes.push('PRODUCT.md has no decided ## Stack, so each step lists the options per stack. Decide the stack first; it narrows everything below.');

  // What the findings say needs most help, by category, weighted by severity.
  const weight = { P0: 4, P1: 3, P2: 2, P3: 1 };
  const need = {};
  for (const f of findings) need[f.category] = (need[f.category] || 0) + (weight[f.severity] || 1);

  const fits = (e) => e.role === 'prototype'
    ? prototype
    : e.platforms.some((p) => platforms.includes(p)) && (!decided || e.stacks.some((s) => stacks.includes(s)));
  const steps = [];
  for (const [role, title] of ROLES) {
    const picks = catalog.entries.filter((e) => e.role === role && fits(e)).map((e) => {
      const because = (e.helps_with || []).filter((c) => need[c]).sort((a, b) => need[b] - need[a]);
      return {
        id: e.id, name: e.name, by: e.by, trust: e.trust, why: e.why, install: e.install, sources: e.sources,
        group: e.group || null, stacks: e.stacks,
        because: because.length ? `Addresses ${because.map((c) => `${c} findings`).join(', ')} in this critique` : null,
        score: because.reduce((n, c) => n + need[c], 0) + (e.trust === 'official' ? 0.5 : e.trust === 'practitioner' ? 0.25 : 0),
      };
    }).sort((a, b) => b.score - a.score);
    if (picks.length) steps.push({ role, title, picks });
  }
  return { verified: catalog.verified, platform, stacks, decided, stackText, steps, notes, watch: catalog.watch || [] };
}

export function stackMarkdown(rec) {
  const L = ['## To build this', ''];
  L.push(`Platform: **${rec.platform}**. Stack: **${rec.decided ? rec.stacks.join(', ') : 'not decided'}**. Picks come only from \`catalog/stack.yaml\` (verified ${rec.verified}); each cites its source.`, '');
  for (const n of rec.notes) L.push(`_${n}_`, '');
  rec.steps.forEach((s, i) => {
    L.push(`### ${i + 1}. ${s.title}`, '');
    for (const p of s.picks) {
      const alt = p.group && s.picks.filter((x) => x.group === p.group).length > 1;
      const stackNote = rec.decided || s.role === 'prototype' ? '' : ` _(for ${p.stacks.join(', ')})_`;
      L.push(`- **${p.name}**, ${p.by} (${p.trust})${stackNote}${alt ? ' · alternative: pick one of the marked options' : ''}  `);
      L.push(`  ${p.why}${p.because ? ` ${p.because}.` : ''}  `);
      L.push(`  Install: \`${p.install}\` · Source: ${p.sources.join(', ')}`);
    }
    L.push('');
  });
  if (rec.watch?.length) {
    L.push('_Watched, not recommended yet:_ ' + rec.watch.map((w) => `${w.name} (${w.why_not_yet})`).join(' '), '');
  }
  return L.join('\n');
}
