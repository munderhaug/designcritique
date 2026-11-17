// Reads design tokens from DESIGN.md (YAML front matter, or Markdown tables and "- name: value"
// lists under headings such as Colours, Spacing, Typography and Radius) or a DTCG / Style
// Dictionary JSON file.
// The parser is deliberately forgiving: it walks every value and classifies it by its key path,
// so it works with Google's DESIGN.md layout and most hand-written token files.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(([^)]+)\)$/i;

export function parseColor(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(COLOR_RE);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = s.match(RGB_RE);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
    return { r: +r, g: +g, b: +b, a: parseFloat(a) };
  }
  return null;
}

export const toHex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function toPx(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(-?\d*\.?\d+)\s*(px|pt|dp|sp|rem|em)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'px').toLowerCase();
  return unit === 'rem' || unit === 'em' ? n * 16 : n;
}

function frontMatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  return m ? YAML.parse(m[1]) : null;
}

const VALUE_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\([^)]*\)|-?\d*\.?\d+\s*(?:px|pt|dp|sp|rem|em)\b/gi;
const clean = (cell) => cell.replace(/`|\*\*|<[^>]+>/g, '').trim();
// Columns and items that measure something other than spacing, size or colour.
const NOT_A_SCALE = /letter|tracking|line[- ]?height|leading|weight|opacity|duration|easing|shadow|elevation|breakpoint|width|z-?index|container|max-|column|viewport/;
const slug = (t) => clean(t).toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^\p{L}\p{N}/&+]+/gu, '-').replace(/^-+|-+$/g, '');

/** A unitless scale written inline: "4/8/12/16", "4, 8, 12, 16", "12 / 14 / 16px". Three or more numbers. */
export function inlineScale(text) {
  const t = String(text).replace(/rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b/gi, ' ');
  const m = t.match(/(?:^|[^\d.])(\d+(?:\.\d+)?(?:\s*(?:px|pt|dp))?(?:\s*[/,·]\s*\d+(?:\.\d+)?(?:\s*(?:px|pt|dp))?){2,})/i);
  if (!m) return [];
  return m[1].split(/[/,·]/).map((x) => parseFloat(x)).filter((n) => Number.isFinite(n));
}

// What a colour is for, from the words describing it ("Primary text", "CTA buttons, links").
// Used only to name a role a system doesn't name itself.
const ROLE_HINTS = [
  ['error', /\b(error|danger|destructive|critical)\b/],
  ['on-surface', /\b(primary|body|main|default|heading)s? text\b|\btext colou?r\b/],
  ['primary', /\b(cta|call[- ]to[- ]action|primary (action|button|interactive|accent)|brand (colou?r|accent)|accent)\b/],
  ['surface', /\b(primary|page|main|default|base)? ?(surface|background|canvas)\b/],
];
export function roleHint(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(border|divider|shadow|hover|focus|pressed|disabled|overlay|scrim|gradient)\b/.test(t)) return null;
  return ROLE_HINTS.find(([, re]) => re.test(t))?.[0] || null;
}
const NAME_ROLE = [
  ['primary', /^(primary|accent|brand|cta|action)(-|$)/],
  ['surface', /^(background|surface|canvas|bg)(-|$)/],
  ['on-surface', /^(text|foreground|ink|fg)(-|$)/],
  ['error', /^(error|danger|destructive)(-|$)/],
];

/**
 * Tokens written as Markdown, each under its headings (all levels, so a "Hierarchy" table under
 * "Typography" counts as type): tables (first column the token name, other columns its values;
 * a column headed "dark" gives the dark value), "- name: value" items, "- **Name** (`#hex`):
 * what it's for" items, and inline scales ("**Spacing scale:** 4/8/12/16").
 * Returns [{ keys, value, name, role }]; role is a hint from the description or the name.
 */
export function markdownTokens(md) {
  const out = [];
  const stack = [];
  let header = null;
  // The level-1 heading is the document's title (often a product name), not a token group.
  const heading = () => stack.slice(1).filter(Boolean).join(' > ');
  // Example prompts and "don't" lists hold values that are not the system's tokens.
  // A sub-section that only explains ("### Principles" under Typography, "Whitespace philosophy")
  // quotes values in prose; "Layout principles" sections, though, hold the spacing scale.
  const notTokens = () => /prompt|don'?t|avoid|anti-?pattern|example|mistake/.test(heading())
    || /^(?:\d+\.\s*)?(?:principles|rationale|[\w ]*philosophy)$/.test(stack.filter(Boolean).slice(-1)[0] || '');
  const push = (name, value, extraKeys = [], hint = null) => {
    const role = hint || NAME_ROLE.find(([, re]) => re.test(name) && !/text|border|surface|background/.test(name.replace(re, '')))?.[0] || null;
    out.push({ keys: [heading(), name, ...extraKeys], value, name, role });
  };
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^(#{1,6})\s+(.+)/);
    if (h) { stack.length = h[1].length - 1; stack[h[1].length - 1] = clean(h[2]).toLowerCase(); header = null; continue; }
    if (notTokens()) continue;
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(clean);
      if (!header) {
        if (/^\s*\|?[\s:-]+\|/.test(lines[i + 1] || '')) { header = cells.map((c) => c.toLowerCase()); i++; }
        continue;
      }
      const name = slug(cells[0] || '');
      if (!name) continue;
      const described = cells.slice(1).find((c, j) => /descr|usage|use|role|purpose/.test(header[j + 1] || ''));
      cells.slice(1).forEach((cell, j) => {
        const col = header[j + 1] || '';
        if (/descr|usage|use|note|purpose|example|role/.test(col) && !/colou?r|value|hex|size/.test(col)) return;
        if (NOT_A_SCALE.test(col)) return;
        // "17px (1.06rem)": the bracketed value restates the first one.
        const outside = cell.replace(/\([^)]*\)/g, ' ');
        const values = (outside.match(VALUE_RE) || []).length ? outside.match(VALUE_RE) : cell.match(VALUE_RE) || [];
        values.forEach((value, k) => {
          const token = /dark/.test(col) ? `dark-${name}` : k ? `${name}-${k + 1}` : name;
          push(token, value, [col], k || /dark/.test(col) ? null : roleHint(described));
        });
      });
      continue;
    }
    header = null;
    // "- **Name** (`#hex`): what it is for"
    const named = line.match(/^\s*[-*]\s+\*\*([^*]+)\*\*\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*:?\s*(.*)$/);
    if (named) {
      const name = slug(named[1]);
      const values = clean(named[2]).match(VALUE_RE) || [];
      values.forEach((value, k) => push(k ? `${name}-${k + 1}` : name, value, [], k ? null : roleHint(named[3])));
      continue;
    }
    // "- name: value", "- **Spacing scale:** 4/8/12/16"
    const item = line.match(/^\s*[-*]\s+(\*\*[^*]+\*\*|[^:]+):\s*(.+)$/);
    if (item) {
      const name = slug(item[1].replace(/:$/, ''));
      if (!name || NOT_A_SCALE.test(name)) continue;
      const text = clean(item[2]);
      const scale = inlineScale(text);
      if (scale.length) { scale.forEach((n, k) => push(`${name}-${k + 1}`, `${n}px`, ['scale'])); continue; }
      (text.match(VALUE_RE) || []).forEach((value, k) => push(k ? `${name}-${k + 1}` : name, value));
    }
  }
  return out;
}

const ALIAS = /^\{([^{}]+)\}$/;
/**
 * Resolve token references ("{color.primitive.blue.500}", W3C Design Tokens Community Group
 * format; also used by DESIGN.md front matter) to the values they point at, following chains and
 * stopping on cycles. Semantic tokens keep their own names, so roles survive.
 */
export function resolveAliases(data) {
  const lookup = (pathStr) => {
    let node = data;
    for (const k of pathStr.split('.')) { if (node == null || typeof node !== 'object') return undefined; node = node[k]; }
    return node && typeof node === 'object' && '$value' in node ? node.$value : node;
  };
  const resolve = (value, seen = new Set()) => {
    if (typeof value !== 'string') return value;
    const m = value.trim().match(ALIAS);
    if (!m || seen.has(m[1])) return m ? undefined : value;
    seen.add(m[1]);
    const target = lookup(m[1]);
    return typeof target === 'string' ? resolve(target, seen) : target;
  };
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    return resolve(node);
  };
  return walk(data);
}

export function loadTokens(file) {
  if (!file || !fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const isJson = path.extname(file).toLowerCase() === '.json';
  const front = isJson ? JSON.parse(text) : frontMatter(text);
  const body = isJson ? '' : text.replace(/^---\s*\n[\s\S]*?\n---\s*(\n|$)/, '');
  const fromMarkdown = isJson ? [] : markdownTokens(body);
  if (!front && !fromMarkdown.length) return null;
  const data = resolveAliases(front || {});

  const colors = new Map();
  const colorByName = new Map();
  const fontFamilies = new Set();
  const spacing = new Set();
  const fontSizes = new Set();
  const radii = new Set();

  let tokenName = null;
  const visit = (node, keys) => {
    if (node == null) return;
    if (Array.isArray(node)) { node.forEach((v) => visit(v, keys)); return; }
    if (typeof node === 'object') {
      if ('$value' in node) { visit(node.$value, keys.concat(node.$type ? [node.$type] : [])); return; }
      for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) visit(v, keys.concat(k));
      return;
    }
    const pathStr = keys.join('.').toLowerCase();
    if (/font-?family|families/.test(pathStr) && typeof node === 'string') {
      fontFamilies.add(node.split(',')[0].replace(/["']/g, '').trim());
      return;
    }
    const color = parseColor(String(node));
    if (color) {
      colors.set(toHex(color), keys.join('.'));
      colorByName.set((tokenName || keys[keys.length - 1]).toLowerCase(), toHex(color));
      return;
    }
    const px = toPx(node);
    // Negative values are offsets or tracking, never a step of a scale.
    if (px == null || px < 0) return;
    // The most specific key decides: a "radius" column under a "Pills (spaces)" heading is a radius.
    for (const part of keys.flatMap((k) => String(k).toLowerCase().split(' > ')).reverse()) {
      if (NOT_A_SCALE.test(part)) return;
      if (/round|radius|radii|corner|shape/.test(part)) { radii.add(px); return; }
      // A step of a spacing scale stays well under 512; larger values are widths and breakpoints.
      if (/spac|space|gap|margin|padding|inset|gutter/.test(part)) { if (px <= 512) spacing.add(px); return; }
      if (/typ|font|text|hierarchy/.test(part) && /size|scale/.test(pathStr)) { if (px >= 6 && px <= 400) fontSizes.add(px); return; }
    }
  };
  visit(data, []);
  for (const t of fromMarkdown) { tokenName = t.name; visit(t.value, t.keys); }
  tokenName = null;
  // A system that names colours by brand ("Deep Navy", "Ocean Blue") still says what each is for;
  // give the first colour described as each role that role's name, unless the role is named.
  const roles = {};
  for (const t of fromMarkdown) {
    const hex = parseColor(t.value);
    if (hex && t.role && !roles[t.role] && !colorByName.has(t.role)) roles[t.role] = { hex: toHex(hex), from: t.name };
  }
  for (const [role, { hex }] of Object.entries(roles)) colorByName.set(role, hex);

  return {
    source: file,
    from: [front ? 'front matter' : null, fromMarkdown.length ? 'Markdown' : null].filter(Boolean),
    body,
    colorByName,
    roles: Object.fromEntries(Object.entries(roles).map(([r, v]) => [r, v.from])),
    fontFamilies: [...fontFamilies],
    colors,
    spacing: [...spacing].sort((a, b) => a - b),
    fontSizes: [...fontSizes].sort((a, b) => a - b),
    radii: [...radii].sort((a, b) => a - b),
  };
}

export function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function nearestColor(hex, palette) {
  const c = parseColor(hex);
  let best = null;
  for (const [tokHex, name] of palette) {
    const d = colorDistance(c, parseColor(tokHex));
    if (!best || d < best.d) best = { hex: tokHex, name, d };
  }
  return best;
}

export function onScale(value, scale, tolerance = 0.5) {
  return scale.some((s) => Math.abs(s - value) <= tolerance);
}

/** WCAG 2.x contrast ratio between two hex colours. */
export function contrastRatio(hexA, hexB) {
  const lum = (hex) => {
    const c = parseColor(hex);
    const ch = [c.r, c.g, c.b].map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [a, b] = [lum(hexA), lum(hexB)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
