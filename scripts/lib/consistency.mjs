// System consistency across every captured screen (principles: CONS-*).
// Deterministic: component variants per role (Frost, Atomic Design 2016), icons with two meanings
// and terms against the glossary (Covert 2014; Podmajersky 2019), number formats (Unicode CLDR
// conventions), and the same labelled figure showing different values (Norman's conceptual model).
import { parseTable } from './product.mjs';
import { parseColor, colorDistance } from './tokens.mjs';
import { mentions } from './structure.mjs';

const near = (a, b, d = 24) => { const x = parseColor(a); const y = parseColor(b); return !!(x && y && colorDistance(x, y) <= d); };

/**
 * Emphasised controls (filled with the accent, or outlined and coloured with it) that look
 * different from each other. controls: [{ screen, name, style }]
 */
export function componentVariants(controls, accent) {
  if (!accent) return [];
  const emphasised = controls.filter((c) => c.style && (near(c.style.bg, accent) || (near(c.style.border, accent) && near(c.style.color, accent))));
  const groups = new Map();
  for (const c of emphasised) {
    const filled = near(c.style.bg, accent);
    const sig = `${filled ? 'filled' : 'outlined'} · radius ${c.style.radius >= 100 ? 'pill' : c.style.radius} · weight ${c.style.weight}`;
    const g = groups.get(sig) || { signature: sig, count: 0, screens: new Set(), examples: new Set() };
    g.count++; g.screens.add(c.screen); if (g.examples.size < 3 && c.name) g.examples.add(c.name);
    groups.set(sig, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).map((g) => ({ ...g, screens: [...g.screens], examples: [...g.examples] }));
}

/** Icons used with more than one meaning. controls: [{ screen, name, icon }] */
export function iconMeanings(controls) {
  const byIcon = new Map();
  for (const c of controls) {
    if (!c.icon || !c.name) continue;
    const e = byIcon.get(c.icon) || { icon: c.icon, names: new Map() };
    const key = c.name.toLowerCase().trim();
    const n = e.names.get(key) || { name: c.name, screens: new Set() };
    n.screens.add(c.screen);
    e.names.set(key, n);
    byIcon.set(c.icon, e);
  }
  return [...byIcon.values()].filter((e) => e.names.size > 1).map((e) => ({ icon: e.icon, meanings: [...e.names.values()].map((n) => ({ name: n.name, screens: [...n.screens] })) }));
}

/**
 * Glossary from the content guide: a table with a term column and an "avoid" column (also
 * "instead of", "don't use", "not"), and/or a Vale-style substitution block (swap: wrong: right).
 */
export function parseGlossary(md) {
  const out = [];
  const text = String(md || '');
  for (const block of text.split(/\n(?=#{1,6}\s)/)) {
    for (const r of parseTable(block)) {
      const keys = Object.keys(r);
      const termKey = keys.find((k) => /^(term|word|use|preferred|begrep|ord|bruk)/.test(k));
      const avoidKey = keys.find((k) => /(avoid|instead|don.?t|not|unngå|ikke)/.test(k));
      if (!termKey || !avoidKey) continue;
      const avoid = r[avoidKey].split(/[,;/]/).map((x) => x.replace(/["“”]/g, '').trim()).filter((x) => x && x !== '-' && x !== '—');
      if (r[termKey] && avoid.length) out.push({ term: r[termKey], avoid });
    }
  }
  const swap = text.match(/^swap:\s*\n((?:[ \t]+.+\n?)+)/m);
  if (swap) {
    for (const line of swap[1].split('\n')) {
      const m = line.match(/^\s+["']?([^:"']+)["']?\s*:\s*["']?([^"'\n]+)["']?\s*$/);
      if (m) out.push({ term: m[2].trim(), avoid: m[1].split('|').map((x) => x.trim()) });
    }
  }
  return out;
}

/** Terms the glossary says to avoid, with the screens they appear on. screens: [{ id, text }] */
export function termUses(screens, glossary) {
  const out = [];
  for (const g of glossary) {
    for (const bad of g.avoid) {
      const on = screens.filter((s) => mentions(s.text, bad)).map((s) => s.id);
      if (on.length) out.push({ avoid: bad, use: g.term, screens: on });
    }
  }
  return out;
}

/** Amount formats (grouping and decimal separators) in use, for amounts of 1,000 and more. */
export function amountFormats(texts) {
  const formats = new Map();
  const re = /(?<![\p{L}\p{N}])(\d{1,3}(?:([ ,.  '])\d{3})+|\d{4,})(?:([.,])(\d{1,2}))?(?![\p{L}\p{N}])/gu;
  for (const { screen, text } of texts) {
    for (const m of String(text).matchAll(re)) {
      // An amount has digit grouping or a decimal part; a bare number (4821, 2024) is an ID, a code or a year.
      if (!m[2] && !m[3]) continue;
      const group = m[2] ? (m[2] === ',' ? 'comma' : m[2] === '.' ? 'dot' : m[2] === "'" ? 'apostrophe' : 'space') : 'none';
      if (m[2] && m[3] && m[2] === m[3]) continue; // ambiguous (e.g. 1.000.00)
      const fmt = `grouping ${group}${m[3] ? `, decimal ${m[3] === ',' ? 'comma' : 'dot'}` : ''}`;
      const f = formats.get(fmt) || { format: fmt, examples: new Set(), screens: new Set() };
      if (f.examples.size < 3) f.examples.add(m[0]);
      f.screens.add(screen);
      formats.set(fmt, f);
    }
  }
  return [...formats.values()].map((f) => ({ ...f, examples: [...f.examples], screens: [...f.screens] }));
}

/**
 * The same short label followed by a figure, with different figures on different screens:
 * "Balance 1,240.00" here and "Balance 1,204.00" there. texts: [{ screen, family, text }]
 */
export function figuresThatDisagree(texts) {
  const re = /(?:^|[\n•·|])\s*([\p{L}][\p{L} ]{2,30}?)\s*:?\s+([€$£¥]?\s?-?\d[\d ,.  ']*\d|\d)\s*(%|[\p{L}€$£]{0,4})?(?=\s*(?:$|\n))/gmu;
  const byLabel = new Map();
  for (const { screen, family, text } of texts) {
    for (const m of String(text).matchAll(re)) {
      const label = m[1].trim().toLowerCase();
      if (label.split(/\s+/).length > 4) continue;
      const value = `${m[2].replace(/\s/g, '')}${m[3] || ''}`;
      // Only figures that should agree everywhere (amounts, totals, percentages): with a
      // decimal part, a currency or percent sign, or 100 or more. Small counters ("Step 2") vary.
      const digits = m[2].replace(/[^\d]/g, '');
      if (!/[.,]\d{1,2}$/.test(m[2]) && !/[€$£¥%]/.test(m[2] + (m[3] || '')) && Number(digits) < 100) continue;
      const e = byLabel.get(label) || { label: m[1].trim(), values: new Map() };
      const v = e.values.get(value) || { value, screens: new Set(), families: new Set() };
      v.screens.add(screen); v.families.add(family);
      e.values.set(value, v);
      byLabel.set(label, e);
    }
  }
  return [...byLabel.values()]
    .filter((e) => e.values.size > 1 && new Set([...e.values.values()].flatMap((v) => [...v.families])).size > 1)
    .map((e) => ({ label: e.label, values: [...e.values.values()].map((v) => ({ value: v.value, screens: [...v.screens] })) }));
}
