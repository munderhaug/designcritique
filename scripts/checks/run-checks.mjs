#!/usr/bin/env node
// Deterministic checks over a capture run. No model involved: same input, same findings.
// Writes <run>/checks/findings.json and <run>/checks/notes.json.
//
// Usage: node scripts/checks/run-checks.mjs --run <runDir>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs, readJson, writeJson, MIN_TARGET, MIN_TEXT } from '../lib/config.mjs';
import { loadTokens, nearestColor, onScale, parseColor } from '../lib/tokens.mjs';
import { designSystemFindings } from './design-system.mjs';
import { readProductStack } from '../lib/stack.mjs';
import { textScaleAdvice } from '../lib/advice.mjs';
import { ethicsFindings } from '../lib/ethics.mjs';
import { loadVocabulary, languagesOf } from '../lib/vocabulary.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: run-checks.mjs --run <runDir>'); process.exit(2); }
const runDir = path.resolve(args.run);
const manifest = readJson(path.join(runDir, 'manifest.json'));
const tokens = loadTokens(manifest.design);

const findings = [];
const notes = [];
const PLATFORM_UNIT = { ios: 'pt', android: 'dp' };

const AXE_SEVERITY = { critical: 'P1', serious: 'P1', moderate: 'P2', minor: 'P3' };
const AXE_FIX = {
  'color-contrast': 'Raise contrast to at least 4.5:1 for normal text and 3:1 for large text (24px, or 19px bold). Use the on-surface / on-surface-variant tokens instead of light greys.',
  'button-name': 'Give icon-only buttons an accessible name (aria-label here; accessibilityLabel / contentDescription in the app).',
  'link-name': 'Give the link text or an accessible name that says where it goes.',
  'image-alt': 'Add alt text, or mark the image decorative (alt="") if it carries no information.',
  label: 'Give every field a visible label, not just a placeholder.',
  'aria-required-children': 'Fix the role structure so assistive technology can read the group.',
  'nested-interactive': 'Do not put a tappable control inside another tappable control.',
  'heading-order': 'Use headings in order so screen reader users can scan the screen.',
};

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const tagOf = (c) => `${c.platform}-${c.device}/${c.variant}`;
// Page data without what a person can't see (under an open sheet, covered, parked off-screen):
// analyze-page marks it `hidden`, and no check measures it.
const load = (rel) => {
  if (!rel) return null;
  const d = readJson(path.join(runDir, rel));
  if (!d || Array.isArray(d) || !d.texts) return d;
  return { ...d, texts: d.texts.filter((t) => !t.hidden), interactive: (d.interactive || []).filter((i) => !i.hidden) };
};

// The principles each check rests on (IDs from skills/principles).
const BASIS = {
  'CHK-NATIVE-NAME': () => ['WCAG-4.1.2'],
  'CHK-TARGET': (p) => [p === 'ios' ? 'IOS-TARGET' : 'AND-TARGET', 'WCAG-2.5.8', 'LAW-FITTS'],
  'CHK-TEXT-MIN': (p) => [p === 'ios' ? 'IOS-TYPE' : 'AND-TYPE', 'VIS-TYPE'],
  'CHK-TEXT-SCALE': (p) => ['WCAG-1.4.4', p === 'ios' ? 'IOS-TYPE' : 'AND-TYPE'],
  'CHK-TEXT-CLIP': () => ['WCAG-1.4.4', 'NN-H6'],
  'CHK-TEXT-OVERLAP': () => ['WCAG-1.4.4', 'GESTALT-FIGURE'],
  'CHK-OVERFLOW': () => ['WCAG-1.4.10'],
  'CHK-SAFE-AREA': (p) => [p === 'ios' ? 'IOS-LAYOUT' : 'AND-LAYOUT'],
  'CHK-DARK': (p) => [p === 'ios' ? 'IOS-COLOR' : 'AND-COLOR'],
  'CHK-TOKEN-COLOR': () => ['NN-H4', 'VIS-COLOR'],
  'CHK-TOKEN-SPACE': () => ['NN-H4', 'VIS-SPACING'],
  'CHK-TOKEN-TYPE': () => ['NN-H4', 'VIS-TYPE'],
  'CHK-TOKEN-RADIUS': (p) => ['NN-H4', p === 'ios' ? 'IOS-LAYOUT' : 'AND-SHAPE'],
  'CHK-LOOPING-MOTION': (p) => ['WCAG-2.2.2', 'VIS-MOTION', p === 'ios' ? 'IOS-MOTION' : 'AND-MOTION'],
  'CHK-OBSCURED': (p) => ['WCAG-2.4.11', p === 'ios' ? 'IOS-LAYOUT' : 'AND-LAYOUT'],
  'CHK-PRESELECTED-CONSENT': () => ['ETHICS-PRESELECTED', 'NN-H3'],
  'CHK-ASYMMETRIC-CHOICE': () => ['ETHICS-ASYMMETRY', 'VIS-HIERARCHY'],
  'CHK-CONFIRMSHAMING': () => ['ETHICS-CONFIRMSHAMING', 'NN-H2'],
};
const AXE_BASIS = {
  'color-contrast': ['WCAG-1.4.3'], 'button-name': ['WCAG-4.1.2'], 'link-name': ['WCAG-2.4.4', 'WCAG-4.1.2'],
  'image-alt': ['WCAG-1.1.1'], label: ['WCAG-3.3.2', 'WCAG-1.3.1'], 'heading-order': ['WCAG-1.3.1'],
  'nested-interactive': ['WCAG-4.1.2'], 'aria-required-children': ['WCAG-1.3.1'],
};

function add(f) {
  const id = `chk-${f.screen}-${f.rule}-${hash(f.key || f.element?.selector || '')}`;
  f.cause = f.key ?? null; // groups the same problem across screens in the report
  delete f.key;
  const basis = f.rule.startsWith('AXE-')
    ? (AXE_BASIS[f.rule.slice(4)] || (f.wcag?.length ? f.wcag : ['WCAG-4.1.2']))
    : (BASIS[f.rule] ? BASIS[f.rule](f.platform) : []);
  delete f.wcag;
  findings.push({ id, source: 'check', confidence: 'high', basis, ...f });
}

function primaryCapture(screen, platform) {
  const caps = screen.captures.filter((c) => c.platform === platform && c.variant === 'light');
  return caps.find((c) => c.device === 'standard') || caps.find((c) => c.device === 'frame') || caps[0];
}

// The stack named in PRODUCT.md decides how fixes are worded (rem vs Dynamic Type vs sp vs web view zoom).
const framingPath = manifest.framingSnapshot ? path.join(runDir, manifest.framingSnapshot) : null;
const productStacks = framingPath && fs.existsSync(framingPath) ? readProductStack(fs.readFileSync(framingPath, 'utf8')).stacks : [];

// Words in the prototype's languages (deceptive-pattern checks).
const vocab = loadVocabulary(languagesOf([manifest.language, manifest.pageLanguages]), manifest.vocabulary || {});

// A native screen (scripts/capture/native.mjs): what its accessibility hierarchy can show.
// Target sizes in pt or dp, and controls a screen reader can't name. Type, contrast and layout
// need the rendering engine's own tools and are left to the critics.
function nativeChecks(screen) {
  for (const platform of [...new Set(screen.captures.map((c) => c.platform))]) {
    const main = primaryCapture(screen, platform);
    if (!main?.data) { notes.push({ screen: screen.id, note: 'Native screen without a readable hierarchy: critics only.' }); continue; }
    const d = load(main.data);
    const base = { screen: screen.id, mockup: screen.mockupId, platform, surface: 'native-render' };
    const min = MIN_TARGET[platform]; const unit = PLATFORM_UNIT[platform];
    const small = d.interactive.filter((el) => !el.disabled && (el.box.w < min - 0.5 || el.box.h < min - 0.5));
    for (const el of small.slice(0, 8)) {
      add({
        ...base, rule: 'CHK-TARGET', category: 'a11y', severity: Math.min(el.box.w, el.box.h) < min * 0.75 ? 'P1' : 'P2',
        title: `Tap target ${el.box.w}×${el.box.h} is below ${min}×${min} ${unit}`,
        element: { selector: el.selector, name: el.name, box: el.box },
        evidence: `${el.tag}${el.name ? ` "${el.name}"` : ' (no name)'} is ${el.box.w}×${el.box.h} ${unit} in the app's accessibility hierarchy on ${main.deviceName}.`,
        recommendation: `Make the tappable area at least ${min}×${min} ${unit}. The visible shape can stay smaller if the hit area is padded.`,
        seenIn: [tagOf(main)],
      });
    }
    const unnamed = d.interactive.filter((el) => !el.disabled && !el.name);
    if (unnamed.length) add({
      ...base, rule: 'CHK-NATIVE-NAME', category: 'a11y', severity: 'P1',
      title: `${unnamed.length} control(s) have no name for a screen reader`,
      element: { selector: unnamed[0].selector, box: unnamed[0].box },
      evidence: unnamed.slice(0, 5).map((el) => `${el.tag} at ${el.box.x},${el.box.y} (${el.box.w}×${el.box.h}): no label, text or description in the accessibility hierarchy`).join('\n'),
      recommendation: platform === 'ios' ? 'Give each control an accessibilityLabel that says what it does.' : 'Give each control a contentDescription (or visible text) that says what it does.',
      seenIn: [tagOf(main)], key: 'unnamed',
    });
  }
}

for (const screen of manifest.screens) {
  if (screen.kind === 'native') { nativeChecks(screen); continue; }
  if (screen.kind !== 'html') {
    notes.push({ screen: screen.id, note: 'Static image: deterministic checks skipped, critic only.' });
    continue;
  }
  const platforms = [...new Set(screen.captures.map((c) => c.platform))];
  for (const platform of platforms) {
    const base = { screen: screen.id, mockup: screen.mockupId, platform };
    const main = primaryCapture(screen, platform);
    if (!main) continue;
    const mainData = load(main.data);
    const caps = screen.captures.filter((c) => c.platform === platform);
    const unit = PLATFORM_UNIT[platform];

    // --- axe-core violations, merged across light and dark ---
    const axeByRule = new Map();
    for (const c of caps.filter((c) => c.axe)) {
      for (const v of load(c.axe)) {
        const e = axeByRule.get(v.id) || { v, nodes: new Map(), seenIn: new Set() };
        e.seenIn.add(tagOf(c));
        for (const n of v.nodes) if (!e.nodes.has(n.target)) e.nodes.set(n.target, { ...n, variant: c.variant });
        axeByRule.set(v.id, e);
      }
    }
    for (const [rule, { v, nodes, seenIn }] of axeByRule) {
      const list = [...nodes.values()];
      const darkOnly = [...seenIn].every((t) => t.endsWith('/dark'));
      add({
        ...base, rule: `AXE-${rule}`, category: 'a11y', severity: AXE_SEVERITY[v.impact] || 'P2',
        title: `${v.help}${darkOnly ? ' (dark mode only)' : ''}`,
        element: { selector: list[0].target },
        evidence: list.slice(0, 5).map((n) => `${n.target} [${n.variant}]: ${n.summary.split('\n').slice(1, 2).join(' ').trim() || n.html}`).join('\n') + (list.length > 5 ? `\n…and ${list.length - 5} more` : ''),
        recommendation: AXE_FIX[rule] || `See ${v.helpUrl}`,
        seenIn: [...seenIn], count: list.length, key: rule,
        wcag: v.tags.filter((t) => /^wcag\d{3,}$/.test(t)).map((t) => { const d = t.slice(4); return `WCAG-${d[0]}.${d[1]}.${d.slice(2)}`; }),
      });
    }

    // --- touch targets ---
    const min = MIN_TARGET[platform];
    const small = mainData.interactive.filter((el) => !el.disabled && !el.inlineInText && (el.box.w < min - 0.5 || el.box.h < min - 0.5));
    for (const el of small.slice(0, 8)) {
      const worst = Math.min(el.box.w, el.box.h);
      add({
        ...base, rule: 'CHK-TARGET', category: 'a11y', severity: worst < min * 0.75 ? 'P1' : 'P2',
        title: `Tap target ${el.box.w}×${el.box.h} is below ${min}×${min} ${unit}`,
        element: { selector: el.selector, name: el.name, box: el.box },
        evidence: `${el.tag}${el.name ? ` "${el.name}"` : ' (no name)'} is ${el.box.w}×${el.box.h} on ${main.deviceName}.`,
        recommendation: `Make the tappable area at least ${min}×${min} ${unit}. The visible shape can stay smaller if the hit area is padded.`,
        seenIn: [tagOf(main)],
      });
    }
    if (small.length > 8) notes.push({ screen: screen.id, note: `${small.length - 8} more small tap targets not listed.` });

    // --- minimum text size ---
    const minText = MIN_TEXT[platform];
    const tiny = mainData.texts.filter((t) => t.fontSize < minText - 0.25);
    if (tiny.length) {
      const smallest = Math.min(...tiny.map((t) => t.fontSize));
      add({
        ...base, rule: 'CHK-TEXT-MIN', category: 'typography', severity: smallest < minText - 2 ? 'P1' : 'P2',
        title: `Text below ${minText} ${unit} (smallest ${smallest})`,
        element: { selector: tiny[0].selector, text: tiny[0].text, box: tiny[0].box },
        evidence: tiny.slice(0, 4).map((t) => `${t.fontSize}px "${t.text}"`).join('\n'),
        recommendation: `Use at least ${minText} ${unit} even for legal and caption text; ${platform === 'ios' ? 'Caption 2 (11pt) is the smallest iOS style' : 'Label Small (11sp) is reserved for short labels'}.`,
        seenIn: [tagOf(main)],
      });
    }

    // --- text scaling (proxy for Dynamic Type / font scale) ---
    for (const lt of caps.filter((c) => c.variant === 'large-text')) {
      const ref = caps.find((c) => c.variant === 'light' && c.device === lt.device);
      if (!ref) continue;
      const a = load(ref.data).texts;
      const b = new Map(load(lt.data).texts.map((t) => [t.selector, t]));
      const pairs = a.filter((t) => b.has(t.selector));
      if (pairs.length < 3) continue;
      const fixed = pairs.filter((t) => b.get(t.selector).fontSize / t.fontSize < 1.1);
      const share = fixed.length / pairs.length;
      if (share >= 0.1) {
        add({
          ...base, rule: 'CHK-TEXT-SCALE', category: 'a11y', severity: share >= 0.5 ? 'P1' : 'P2',
          title: share >= 0.9 ? 'Text does not scale with the user\'s text size' : `${Math.round(share * 100)}% of text does not scale with the user's text size`,
          element: { selector: fixed[0].selector, text: fixed[0].text },
          evidence: `${fixed.length} of ${pairs.length} text elements kept their size when text was enlarged 135%. Examples: ${fixed.slice(0, 3).map((t) => `"${t.text}" ${t.fontSize}px`).join(', ')}.`,
          recommendation: textScaleAdvice(platform, productStacks),
          seenIn: [tagOf(lt)], key: 'scale',
        });
        break;
      }
    }

    // --- clipped text ---
    const clipped = new Map();
    for (const c of caps.filter((c) => c.variant !== 'dark')) {
      for (const t of load(c.data).texts.filter((t) => t.clipped)) {
        const e = clipped.get(t.selector) || { t, seenIn: new Set() };
        e.seenIn.add(tagOf(c));
        clipped.set(t.selector, e);
      }
    }
    if (clipped.size) {
      const list = [...clipped.values()];
      const atDefault = list.some((e) => e.seenIn.has(tagOf(main)));
      add({
        ...base, rule: 'CHK-TEXT-CLIP', category: 'layout', severity: atDefault ? 'P3' : 'P2',
        title: atDefault ? `${list.length} text element(s) truncated at default size` : `${list.length} text element(s) truncate at large text or small screens`,
        element: { selector: list[0].t.selector, text: list[0].t.text },
        evidence: list.slice(0, 4).map((e) => `"${e.t.text}" in ${[...e.seenIn].join(', ')}`).join('\n'),
        recommendation: 'Let important text wrap to two lines, or make sure the full text is reachable (detail view, accessibility label). Check the layout at the largest text size.',
        seenIn: [...new Set(list.flatMap((e) => [...e.seenIn]))], key: 'clip',
      });
    }

    // --- text overlapping text ---
    // Two text elements whose rendered lines intersect, usually once text is enlarged: badges,
    // labels over images, absolutely positioned captions. Thresholds adapted from AutoDesign's
    // poster DOM audit (Yaxin Luo, MIT): ignore slivers under 24 px² or under 8% of the smaller line.
    const overlaps = new Map();
    for (const c of caps.filter((c) => c.variant !== 'dark')) {
      // Only text a person can see: not under an open sheet, an inert layer or an opaque surface.
      const texts = load(c.data).texts.filter((t) => t.lines?.length && !t.hidden);
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          // Content scrolling under fixed or sticky chrome (tab bar, header) is expected.
          if (!!texts[i].fixed !== !!texts[j].fixed) continue;
          const hit = worstOverlap(texts[i].lines, texts[j].lines);
          if (!hit) continue;
          const key = [texts[i].selector, texts[j].selector].sort().join(' | ');
          const e = overlaps.get(key) || { a: texts[i], b: texts[j], ratio: 0, seenIn: new Set() };
          e.ratio = Math.max(e.ratio, hit.ratio);
          e.seenIn.add(tagOf(c));
          overlaps.set(key, e);
        }
      }
    }
    if (overlaps.size) {
      const list = [...overlaps.values()].sort((x, y) => y.ratio - x.ratio);
      const atDefault = list.some((e) => e.seenIn.has(tagOf(main)));
      add({
        ...base, rule: 'CHK-TEXT-OVERLAP', category: 'layout', severity: list[0].ratio >= 0.15 ? 'P1' : 'P2',
        title: atDefault ? `${list.length} pair(s) of text overlap at default size` : `${list.length} pair(s) of text overlap at large text or small screens`,
        element: { selector: list[0].a.selector, text: list[0].a.text },
        evidence: list.slice(0, 4).map((e) => `"${e.a.text}" over "${e.b.text}" (${Math.round(e.ratio * 100)}% of the smaller line) in ${[...e.seenIn].join(', ')}`).join('\n'),
        recommendation: 'Keep text in the flow instead of positioning it over other text; let rows grow with the text size, and check the layout at the largest text size.',
        seenIn: [...new Set(list.flatMap((e) => [...e.seenIn]))], key: 'overlap',
      });
    }

    // --- horizontal overflow ---
    const over = caps.filter((c) => c.variant !== 'dark').map((c) => ({ c, d: load(c.data) })).filter(({ d }) => d.scrollWidth > d.viewport.width + 1);
    if (over.length) {
      const { c, d } = over[0];
      const wide = !d.hasViewportMeta || d.scrollWidth > 600;
      add({
        ...base, rule: 'CHK-OVERFLOW', category: 'layout', severity: 'P1',
        title: `Content is ${d.scrollWidth - d.viewport.width}px wider than the screen`,
        element: d.overflowing[0] ? { selector: d.overflowing[0].selector, box: d.overflowing[0].box } : null,
        evidence: `Page is ${d.scrollWidth}px wide on a ${d.viewport.width}px screen (${c.deviceName}). Overflowing: ${d.overflowing.map((o) => o.selector).join('; ') || 'unknown'}.`,
        recommendation: wide && !screen.phoneFrame
          ? 'If this is a canvas showing phone frames, set phone_frame: to the frame selector in mockups.yaml. Otherwise remove fixed widths so the layout fits 360–430px screens.'
          : 'Remove fixed widths; let rows wrap or stack so the layout fits 360–430px screens.',
        seenIn: over.map(({ c }) => tagOf(c)), key: 'overflow',
      });
    }

    // --- safe areas (status bar / Dynamic Island, home indicator / gesture bar) ---
    // Capture emulates the device's insets for env(safe-area-inset-*) when the page sets
    // viewport-fit=cover, as a phone does, so pages that pad by the insets are judged as on a device.
    const sa = [];
    if (mainData.safeAreaCss && !mainData.viewportFitCover) {
      notes.push({ screen: screen.id, note: 'Uses env(safe-area-inset-*) without viewport-fit=cover in the viewport meta, so on a phone the insets are 0 and the padding does nothing.' });
    } else if (mainData.safeAreaCss && mainData.insets && !mainData.insets.applied) {
      notes.push({ screen: screen.id, note: `Safe areas not checked: ${mainData.insets.reason}. Check on a device or simulator.` });
    }
    const skipSafeArea = mainData.safeAreaCss && mainData.viewportFitCover && mainData.insets && !mainData.insets.applied;
    // Fixed bars are judged where they sit on the screen, also after a scroll step moved the page.
    const top = (e) => (e.fixed && e.viewY != null ? e.viewY : e.box.y);
    for (const el of skipSafeArea ? [] : mainData.interactive.filter((e) => !e.disabled && top(e) < mainData.viewport.height)) {
      const y = top(el);
      if (y < main.safeTop && y + el.box.h > 0) sa.push({ el, where: platform === 'ios' ? 'status bar / Dynamic Island' : 'status bar' });
      else if (el.fixed && y + el.box.h > mainData.viewport.height - main.safeBottom + 1) sa.push({ el, where: platform === 'ios' ? 'home indicator' : 'gesture navigation bar' });
    }
    for (const where of [...new Set(sa.map((s) => s.where))]) {
      const els = sa.filter((s) => s.where === where).map((s) => s.el);
      add({
        ...base, rule: 'CHK-SAFE-AREA', category: 'platform', severity: 'P2',
        title: `${els.length} control(s) sit in the ${where} area`,
        element: { selector: els[0].selector, name: els[0].name, box: els[0].box },
        evidence: els.slice(0, 5).map((el) => `${el.tag}${el.name ? ` "${el.name}"` : ''} at y=${el.box.y}, h=${el.box.h}`).join('\n') +
          `\nSafe insets on ${main.deviceName}: ${main.safeTop} top / ${main.safeBottom} bottom.`,
        recommendation: 'Keep controls inside the safe area: pad bars by the top and bottom insets (safeAreaInset / WindowInsets).',
        seenIn: [tagOf(main)], key: where,
      });
    }

    // --- controls hidden under fixed bars, even scrolled as far as the page goes ---
    for (const el of mainData.obscured || []) {
      add({
        ...base, rule: 'CHK-OBSCURED', category: 'layout', severity: el.entirely || el.filled ? 'P1' : 'P2',
        title: `${el.name ? `"${el.name}"` : `A ${el.tag}`} stays ${el.entirely ? 'hidden' : 'partly hidden'} under fixed content`,
        element: { selector: el.selector, name: el.name },
        evidence: `Scrolled as far as the page allows on ${main.deviceName}, the ${el.tag}${el.name ? ` "${el.name}"` : ''} is ${el.entirely ? 'entirely' : 'partly (its centre)'} covered by ${el.by} (${el.byBox.w}×${el.byBox.h} at y=${el.byBox.y}).`,
        recommendation: 'Pad the scrolling content by the height of the fixed bar (and the bottom inset), so the last controls can scroll clear of it.',
        seenIn: [tagOf(main)], key: el.selector,
      });
    }

    // --- looping motion that can't be paused (WCAG 2.2.2); loading indicators are exempt ---
    const loops = (mainData.looping || []).filter((l) => !l.busy && !vocab.states.loading.test(l.label));
    if (loops.length) {
      add({
        ...base, rule: 'CHK-LOOPING-MOTION', category: 'visual', severity: 'P2',
        title: `${loops.length} element(s) animate in an endless loop`,
        element: { selector: loops[0].selector, box: loops[0].box },
        evidence: loops.slice(0, 5).map((l) => `${l.selector} (${l.animation})${l.label ? ` near "${l.label.slice(0, 40)}"` : ''}`).join('\n'),
        recommendation: 'Stop decorative loops after a few cycles (under 5 seconds), or give a way to pause them, and remove them under reduce motion. Keep endless motion for loading indicators, marked as such (role="progressbar" or aria-busy).',
        seenIn: [tagOf(main)], key: 'looping',
      });
    }

    // --- deceptive patterns (ETHICS-*) ---
    for (const f of ethicsFindings({ interactive: mainData.interactive, text: [...mainData.texts.map((t) => t.text), ...mainData.interactive.map((i) => i.name)].join('\n'), pageBg: mainData.pageBg, vocab })) {
      add({ ...base, ...f, category: 'ethics', seenIn: [tagOf(main)], key: f.rule });
    }

    // --- dark appearance ---
    const dark = caps.find((c) => c.variant === 'dark');
    if (dark) {
      const lightColors = Object.keys(mainData.colors).sort().join();
      const darkColors = Object.keys(load(dark.data).colors).sort().join();
      if (lightColors === darkColors) {
        if (screen.appearance && screen.appearance !== 'both') {
          notes.push({ screen: screen.id, note: `Single appearance by design (appearance: ${screen.appearance}); dark mode not required.` });
        } else if (manifest.requires?.darkMode) {
          add({
            ...base, rule: 'CHK-DARK', category: 'color', severity: 'P2',
            title: 'No dark appearance',
            element: null,
            evidence: 'The screen renders identically with the system in dark mode.',
            recommendation: 'Add dark values for every colour role (prefers-color-scheme in mockups; dynamic system colours / dark theme in the app).',
            seenIn: [tagOf(dark)], key: 'dark',
          });
        } else notes.push({ screen: screen.id, note: 'No dark appearance (not required by mockups.yaml).' });
      }
    }

    // --- tokens ---
    if (tokens) {
      const darkData = dark ? load(dark.data) : null;
      if (tokens.colors.size) {
        const used = new Map();
        for (const d of [mainData, darkData].filter(Boolean)) {
          for (const [key, v] of Object.entries(d.colors)) {
            if (key.includes('@')) continue; // translucent overlays are usually derived; skip
            const e = used.get(key) || { count: 0, examples: new Set() };
            e.count += v.count; v.examples.forEach((x) => e.examples.add(x));
            used.set(key, e);
          }
        }
        const off = [...used].filter(([hex]) => {
          const n = nearestColor(hex, tokens.colors);
          return !n || n.d > 3;
        }).sort((a, b) => b[1].count - a[1].count);
        if (off.length) {
          add({
            ...base, rule: 'CHK-TOKEN-COLOR', category: 'tokens', severity: 'P2',
            title: `${off.length} colour(s) not in the design tokens`,
            element: { selector: [...off[0][1].examples][0] },
            evidence: off.slice(0, 6).map(([hex, e]) => {
              const n = nearestColor(hex, tokens.colors);
              return `${hex} ×${e.count} (e.g. ${[...e.examples][0]}); nearest token ${n.name} ${n.hex}`;
            }).join('\n'),
            recommendation: 'Replace hard-coded colours with colour tokens, or add the colour to DESIGN.md if it is a deliberate new role.',
            seenIn: [tagOf(main)].concat(darkData ? [tagOf(dark)] : []), key: 'color',
          });
        }
      }
      const scaleCheck = (rule, map, scale, label, ignore = () => false) => {
        if (!scale.length) return;
        const off = Object.entries(map).map(([v, e]) => [parseFloat(v), e]).filter(([v]) => !ignore(v) && !onScale(v, scale)).sort((a, b) => b[1].count - a[1].count);
        if (!off.length) return;
        add({
          ...base, rule, category: 'tokens', severity: 'P3',
          title: `${off.length} ${label} value(s) off the scale`,
          element: { selector: off[0][1].examples[0] },
          evidence: off.slice(0, 6).map(([v, e]) => `${v}px ×${e.count} (e.g. ${e.examples[0]})`).join('\n') + `\nScale: ${scale.join(', ')}`,
          recommendation: `Snap ${label} to the token scale.`,
          seenIn: [tagOf(main)], key: rule,
        });
      };
      // Padding that adds the device's safe-area inset (env(safe-area-inset-*) + a token) is on
      // the scale once the inset is taken away.
      const insets = mainData.insets?.applied ? [mainData.insets.top, mainData.insets.bottom].filter((x) => x > 0) : [];
      const insetPlusToken = (v) => insets.some((i) => Math.abs(v - i) <= 0.5 || onScale(v - i, tokens.spacing));
      scaleCheck('CHK-TOKEN-SPACE', mainData.spacing, tokens.spacing, 'spacing', (v) => v <= 2 || insetPlusToken(v));
      scaleCheck('CHK-TOKEN-TYPE', mainData.fontSizes, tokens.fontSizes, 'font size');
      const pill = Math.max(...tokens.radii, 0) >= 100;
      scaleCheck('CHK-TOKEN-RADIUS', mainData.radii, tokens.radii, 'corner radius', (v) => v <= 2 || (pill && v >= 100));
    }
  }
}

if (tokens) findings.push(...designSystemFindings(tokens, manifest.design));
if (!tokens) notes.push({ screen: '*', note: manifest.design ? `No tokens found in ${manifest.design}; token checks skipped. Put tokens in YAML front matter, or in Markdown tables or "- name: value" lists under headings such as Colours, Spacing, Typography and Radius (see templates/DESIGN.md).` : 'No DESIGN.md configured; token checks skipped.' });

const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.screen.localeCompare(b.screen) || a.rule.localeCompare(b.rule));
writeJson(path.join(runDir, 'checks', 'findings.json'), findings);
writeJson(path.join(runDir, 'checks', 'notes.json'), notes);
const counts = findings.reduce((m, f) => ((m[f.severity] = (m[f.severity] || 0) + 1), m), {});
console.log(`Checks: ${findings.length} findings ${JSON.stringify(counts)}; ${notes.length} notes`);
console.log(`Wrote ${path.join(runDir, 'checks', 'findings.json')}`);

function worstOverlap(linesA, linesB) {
  let best = null;
  for (const a of linesA) {
    for (const b of linesB) {
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (w <= 0 || h <= 0) continue;
      const area = w * h;
      const ratio = area / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
      if (area <= 24 || ratio < 0.08) continue;
      if (!best || ratio > best.ratio) best = { area, ratio };
    }
  }
  return best;
}
