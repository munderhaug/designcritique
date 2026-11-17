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

/**
 * Tokens written as Markdown: tables (first column the token name, other columns its values;
 * a column headed "dark" gives the dark value) and "- name: value" list items, each under the
 * nearest heading. Returns [{ keys, value, name }].
 */
export function markdownTokens(md) {
  const out = [];
  let heading = '';
  let header = null;
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^#{1,6}\s+(.+)/);
    if (h) { heading = clean(h[1]).toLowerCase(); header = null; continue; }
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(clean);
      if (!header) {
        if (/^\s*\|?[\s:-]+\|/.test(lines[i + 1] || '')) { header = cells.map((c) => c.toLowerCase()); i++; }
        continue;
      }
      const name = cells[0]?.toLowerCase().replace(/\s+/g, '-');
      if (!name) continue;
      cells.slice(1).forEach((cell, j) => {
        const col = header[j + 1] || '';
        if (/descr|usage|use|note|purpose|example|role/.test(col) && !/colou?r|value|hex|size/.test(col)) return;
        const values = cell.match(VALUE_RE) || [];
        values.forEach((value, k) => {
          const token = /dark/.test(col) ? `dark-${name}` : k ? `${name}-${k + 1}` : name;
          out.push({ keys: [heading, token, col], value, name: token });
        });
      });
      continue;
    }
    header = null;
    const item = line.match(/^\s*[-*]\s+([^:]+):\s*(.+)$/);
    if (item) {
      const name = clean(item[1]).toLowerCase().replace(/\s+/g, '-');
      (clean(item[2]).match(VALUE_RE) || []).forEach((value, k) => out.push({ keys: [heading, k ? `${name}-${k + 1}` : name], value, name: k ? `${name}-${k + 1}` : name }));
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
    if (px == null) return;
    if (/spac|space|gap|margin|padding|inset|gutter/.test(pathStr)) spacing.add(px);
    else if (/(typ|font|text)/.test(pathStr) && /size|scale/.test(pathStr)) fontSizes.add(px);
    else if (/round|radius|radii|corner|shape/.test(pathStr)) radii.add(px);
  };
  visit(data, []);
  for (const t of fromMarkdown) { tokenName = t.name; visit(t.value, t.keys); }
  tokenName = null;

  return {
    source: file,
    from: [front ? 'front matter' : null, fromMarkdown.length ? 'Markdown' : null].filter(Boolean),
    body,
    colorByName,
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
