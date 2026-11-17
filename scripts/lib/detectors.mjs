// Third-party anti-pattern detectors, by surface. A detector sees the app from one angle:
//   rendered: the screen as a browser renders it (HTML mockups, served PWAs)
//   source:   the code a screen is built from (HTML/CSS, React Native, SwiftUI, Compose,
//             Android XML layouts, Flutter)
//   native-render: a native build on a simulator or device. Reserved: not captured yet, so no
//             engine runs on it, but findings and the merge already carry the surface.
// The same problem seen from two angles is merged in the report (agreement "rendered-and-source").
//
// Only allowlisted rules are imported, each mapped to a principle ID from the citation index.
// Rules a plugin check already measures (contrast on solid fills, text size, overlap, overflow,
// tokens, looping motion) are left out so one problem isn't reported twice by two checks.
import path from 'node:path';

export const SURFACES = ['rendered', 'source', 'native-render'];

/** The engines, the surfaces each one reads, and its pinned package (package.json). */
export const ENGINES = {
  impeccable: { by: 'Paul Bakaus', package: 'impeccable', surfaces: ['rendered', 'source'], sourceExt: ['.html', '.htm', '.css', '.jsx', '.tsx', '.vue', '.svelte'] },
  unslopovich: { by: 'erkamyaman (github.com/erkamyaman/unslopovich)', package: 'unslopovich', surfaces: ['source'], sourceExt: ['.swift', '.kt', '.kts', '.dart', '.tsx', '.jsx', '.ts', '.js', '.mjs', '.vue', '.svelte', '.astro', '.html', '.xml', '.css', '.scss'] },
};

const STACK_PLATFORM = { swift: ['ios'], kotlin: ['android'], xml: ['android'] };
const EXT_STACK = { '.swift': 'swift', '.kt': 'kotlin', '.kts': 'kotlin', '.xml': 'xml', '.dart': 'dart' };

/** Which platform principles apply: the source language decides when it is native, else the screen. */
export function platformsOf(platform, file) {
  const fromStack = STACK_PLATFORM[EXT_STACK[path.extname(file || '').toLowerCase()]];
  if (fromStack) return fromStack;
  if (platform === 'ios') return ['ios'];
  if (platform === 'android') return ['android'];
  return ['ios', 'android'];
}
const per = (ios, android) => (pl) => [...(pl.includes('ios') ? [ios] : []), ...(pl.includes('android') ? [android] : [])];

// english: the rule matches English phrases only, so it runs only when the product is in English.
export const IMPECCABLE_RULES = {
  'ai-color-palette': { severity: 'P3', category: 'visual', basis: ['TELL-GRADIENT', 'VIS-COLOR'] },
  'gradient-text': { severity: 'P3', category: 'visual', basis: ['TELL-GRADIENT', 'VIS-TYPE'] },
  'nested-cards': { severity: 'P3', category: 'visual', basis: ['TELL-CARDS', 'GESTALT-REGION'] },
  'hero-eyebrow-chip': { severity: 'P3', category: 'typography', basis: ['TELL-EYEBROW', 'VIS-TYPE'] },
  'kicker-above-heading': { severity: 'P3', category: 'typography', basis: ['TELL-EYEBROW', 'VIS-TYPE'] },
  'marketing-buzzword': { severity: 'P3', category: 'content', basis: ['TELL-BUZZWORDS', 'NN-H2'], english: true },
  'skipped-heading': { severity: 'P3', category: 'a11y', basis: ['WCAG-1.3.1'] },
  // axe measures contrast on solid fills; text on a gradient is what it can't measure.
  'low-contrast': { severity: 'P2', category: 'a11y', basis: ['WCAG-1.4.3'], when: (f) => /gradient on/i.test(f.snippet || '') },
};

export const UNSLOPOVICH_RULES = {
  'fixed-text-size': { severity: 'P2', category: 'a11y', basis: (pl) => [...per('IOS-TYPE', 'AND-TYPE')(pl), 'WCAG-1.4.4'] },
  'zoom-disabled': { severity: 'P2', category: 'a11y', basis: ['WCAG-1.4.4'] },
  'img-no-alt': { severity: 'P2', category: 'a11y', basis: ['WCAG-1.1.1'] },
  'clickable-div': { severity: 'P2', category: 'a11y', basis: ['WCAG-4.1.2'] },
  'focus-removed': { severity: 'P2', category: 'a11y', basis: ['WCAG-2.4.7'] },
  'back-gesture': { severity: 'P2', category: 'platform', basis: (pl) => [...per('IOS-NAV-STACK', 'AND-APPBAR')(pl), 'NN-H3'] },
  'safe-area-off': { severity: 'P2', category: 'layout', basis: (pl) => per('IOS-LAYOUT', 'AND-LAYOUT')(pl), confidence: 'medium' },
  'keyboard-cover': { severity: 'P2', category: 'layout', basis: (pl) => per('IOS-LAYOUT', 'AND-LAYOUT')(pl), confidence: 'medium' },
  'drawer-nav': { severity: 'P3', category: 'platform', basis: (pl) => ['TELL-WEB-IDIOMS', ...per('IOS-NAV-TABBAR', 'AND-NAV-BAR')(pl)] },
  'hover-only': { severity: 'P3', category: 'platform', basis: ['TELL-WEB-IDIOMS'] },
  'decorative-pulse': { severity: 'P3', category: 'visual', basis: ['WCAG-2.2.2', 'VIS-MOTION'] },
  'slop-gradient': { severity: 'P3', category: 'visual', basis: ['TELL-GRADIENT', 'VIS-COLOR'] },
  'gradient-text': { severity: 'P3', category: 'visual', basis: ['TELL-GRADIENT', 'VIS-TYPE'] },
  'nested-cards': { severity: 'P3', category: 'visual', basis: ['TELL-CARDS', 'GESTALT-REGION'] },
  'tracked-caps-label': { severity: 'P3', category: 'typography', basis: ['TELL-EYEBROW', 'VIS-TYPE'] },
  'emoji-icon': { severity: 'P3', category: 'visual', basis: (pl) => ['TELL-EMOJI', ...per('IOS-ICONS', 'AND-ICONS')(pl)] },
  'unverified-claim': { severity: 'P3', category: 'content', basis: ['TELL-FAKE-PROOF', 'NN-H2'], english: true },
  'invented-stat': { severity: 'P3', category: 'content', basis: ['TELL-FAKE-PROOF', 'NN-H2'], english: true },
  'buzzword-copy': { severity: 'P3', category: 'content', basis: ['TELL-BUZZWORDS', 'NN-H2'], english: true },
  'vague-button': { severity: 'P3', category: 'content', basis: ['WCAG-2.4.6'], english: true },
  'oops-error': { severity: 'P2', category: 'content', basis: ['NN-H9', 'WCAG-3.3.3'], english: true },
};

const RULES = { impeccable: IMPECCABLE_RULES, unslopovich: UNSLOPOVICH_RULES };

/** Is the product (or any page) in English? Unknown counts as English: the rules' own language. */
export function isEnglish(languages = []) {
  const known = languages.filter(Boolean);
  return !known.length || known.some((l) => /^en\b/i.test(l));
}

/**
 * One raw engine finding to a designcritique finding, or null when the rule isn't allowlisted.
 * raw: { engine, surface, rule, message, snippet, file, line, fix }; ctx: { screen, platform, english }.
 */
export function mapDetectorFinding(raw, ctx) {
  const rule = RULES[raw.engine]?.[raw.rule];
  if (!rule) return null;
  if (rule.english && !ctx.english) return null;
  if (rule.when && !rule.when(raw)) return null;
  const pl = platformsOf(ctx.platform, raw.file);
  const basis = typeof rule.basis === 'function' ? rule.basis(pl) : rule.basis;
  const where = raw.surface === 'source' && raw.file ? `${raw.file}${raw.line ? `:${raw.line}` : ''}` : null;
  return {
    source: `detector:${raw.engine}`,
    engine: raw.engine,
    surface: raw.surface,
    screen: ctx.screen || '*',
    mockup: ctx.mockup || null,
    platform: ctx.platform || null,
    rule: `${raw.engine.toUpperCase()}-${raw.rule}`,
    basis,
    category: rule.category,
    severity: rule.severity,
    confidence: rule.confidence || 'high',
    title: String(raw.message || raw.rule).split(/\.\s/)[0].replace(/\.$/, '').slice(0, 110),
    element: where ? { file: raw.file, line: raw.line || null } : null,
    evidence: `${raw.engine} ${raw.rule} (${raw.surface}${where ? `, ${where}` : ''}): ${raw.snippet || raw.message}`.slice(0, 600),
    recommendation: raw.fix || 'See the detector rule for the fix.',
    instances: [{ surface: raw.surface, file: raw.file || null, line: raw.line || null, snippet: raw.snippet || null }],
  };
}

/**
 * One finding per engine, rule and screen. Several hits (four gradients on one screen, or the
 * same rule seen rendered and in the source) become one finding listing every surface and place.
 */
export function collapseDetectorFindings(findings) {
  const out = new Map();
  for (const f of findings) {
    const key = `${f.rule}|${f.screen}`;
    const prev = out.get(key);
    if (!prev) { out.set(key, { ...f, surfaces: [f.surface] }); continue; }
    prev.instances.push(...f.instances);
    if (!prev.surfaces.includes(f.surface)) prev.surfaces.push(f.surface);
    if (!prev.element && f.element) prev.element = f.element;
  }
  for (const f of out.values()) {
    f.surface = f.surfaces.length > 1 ? f.surfaces.join('+') : f.surfaces[0];
    if (f.instances.length > 1) {
      const places = f.instances.map((i) => (i.file && i.surface === 'source' ? `${i.file}${i.line ? `:${i.line}` : ''}` : i.surface));
      const uniq = [...new Set(places)];
      f.evidence = `${f.engine} ${f.rule.slice(f.engine.length + 1)}: ${f.instances.length} hits (${uniq.slice(0, 8).join(', ')}${uniq.length > 8 ? ', …' : ''}). First: ${f.instances[0].snippet || f.title}`.slice(0, 600);
    }
    f.id = `det-${f.engine}-${f.rule.slice(f.engine.length + 1)}-${f.screen}`.replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase();
  }
  return [...out.values()];
}

/**
 * Tie a source file to a screen: the HTML mockup file itself, or a file under a mockup's
 * source: paths. Anything else (shared components, the rest of the app) is screen "*".
 * screens: [{ id, mockupId, source (abs), sourceFiles (abs[]), platform, hasSteps }]
 */
export function screenForFile(file, screens) {
  const abs = path.resolve(file);
  const own = screens.find((s) => !s.hasSteps && s.source && path.resolve(s.source) === abs);
  if (own) return own;
  return screens.find((s) => !s.hasSteps && (s.sourceFiles || []).some((p) => abs === path.resolve(p) || abs.startsWith(path.resolve(p) + path.sep))) || null;
}

/** File extensions an engine reads, for picking targets from source: paths. */
export function engineReads(engine, file) {
  return ENGINES[engine].sourceExt.includes(path.extname(file).toLowerCase());
}
