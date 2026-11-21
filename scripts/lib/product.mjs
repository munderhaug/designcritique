// The product model from PRODUCT.md for whole-product review: journeys, concept model, scope
// and feature map (the frame skill writes these sections; see templates/PRODUCT.md).
import { section, stripComments } from './framing.mjs';

/** Rows of the first Markdown table in `md`, as objects keyed by lower-cased header. */
export function parseTable(md) {
  const lines = stripComments(md).split('\n').filter((l) => /^\s*\|/.test(l));
  if (lines.length < 2) return [];
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/\*\*|`/g, '').trim());
  const head = cells(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(2).map(cells).filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const col = (row, ...names) => {
  const k = Object.keys(row).find((key) => names.some((n) => key.includes(n)));
  return k ? row[k] : '';
};
const PHASES = [['mvp', /\bmvp\b|must|now|v0/i], ['v1', /\bv1\b|next|1\.0/i], ['later', /later|future|v2|senere|seinere/i], ['out', /out|not|ikke|never|excluded|utenfor/i]];
export const phaseOf = (s) => (PHASES.find(([, re]) => re.test(s || '')) || [null])[0];
const list = (s) => String(s || '').split(/[,;]|\s\/\s/).map((x) => x.trim()).filter(Boolean);

/** "1. **checkout** (must not fail, during, leads to track-order): Cart → Pay → Confirm" */
export function parseJourneys(md) {
  const out = [];
  for (const line of stripComments(section(md, 'Journeys')).split('\n')) {
    const m = line.match(/^\s*(?:\d+\.|[-*])\s+\*\*([^*]+)\*\*\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/);
    if (!m) continue;
    const flags = (m[2] || '').toLowerCase();
    out.push({
      id: m[1].trim().toLowerCase().replace(/\s+/g, '-'),
      title: m[1].trim(),
      critical: /must not fail|critical|kritisk/.test(flags),
      stage: (flags.match(/\b(before|during|after|setup|routine)\b/) || [])[1] || null,
      leads_to: (flags.match(/leads to ([\w-]+)/) || [])[1] || null,
      steps: m[3].split(/\s*(?:→|->|>)\s*/).map((s) => s.replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean),
    });
  }
  return out;
}

export function parseConceptModel(md) {
  const text = section(md, 'Concept model');
  const rows = parseTable(text);
  if (rows.length) return rows.map((r) => ({ object: col(r, 'object', 'objekt', 'concept'), relations: list(col(r, 'relat', 'has', 'har')), actions: list(col(r, 'action', 'cta', 'handling')), attributes: list(col(r, 'attrib')) })).filter((o) => o.object);
  return stripComments(text).split('\n').map((l) => l.match(/^\s*[-*]\s+\*{0,2}([^*:]+)\*{0,2}\s*:\s*(.+)$/)).filter(Boolean).map((m) => ({ object: m[1].trim(), relations: list(m[2]), actions: [], attributes: [] }));
}

/** Scope as { mvp:[], v1:[], later:[], out:[] } from a table (Phase | Includes) or ### headings with bullets. */
export function parseScope(md) {
  const text = section(md, 'Scope');
  const scope = { mvp: [], v1: [], later: [], out: [] };
  const rows = parseTable(text);
  if (rows.length) {
    for (const r of rows) {
      const ph = phaseOf(col(r, 'phase', 'fase', 'release'));
      if (ph) scope[ph].push(...list(col(r, 'include', 'feature', 'items', 'what', 'innhold')));
    }
    return scope;
  }
  let current = null;
  for (const line of stripComments(text).split('\n')) {
    const h = line.match(/^#{3,6}\s+(.+)/) || line.match(/^\s*\*\*([^*]+)\*\*\s*:?\s*$/);
    if (h) { current = phaseOf(h[1]); continue; }
    const item = line.match(/^\s*[-*]\s+(.+)/);
    if (item && current) scope[current].push(item[1].replace(/\*\*/g, '').trim());
  }
  return scope;
}

/** | Feature | Problem part | Key task | Phase | Seen as | */
export function parseFeatureMap(md) {
  return parseTable(section(md, 'Feature map')).map((r) => {
    const feature = col(r, 'feature', 'funksjon');
    return {
      feature,
      problem: col(r, 'problem'),
      task: col(r, 'task', 'oppgave'),
      phase: phaseOf(col(r, 'phase', 'fase')),
      seenAs: [...new Set([feature, ...list(col(r, 'seen', 'label', 'vises'))].filter(Boolean))],
    };
  }).filter((f) => f.feature);
}

/** Navigation order from "## Navigation": a numbered or bulleted list of destinations. */
export function parseNavigation(md) {
  return stripComments(section(md, 'Navigation')).split('\n').map((l) => l.match(/^\s*(?:\d+\.|[-*])\s+(.+)/)).filter(Boolean).map((m) => m[1].replace(/\*\*|`/g, '').replace(/\s*[(:—–-].*$/, '').trim()).filter(Boolean);
}

/**
 * Key tasks from "## Key Tasks": "1. **Pay for an order** (must not fail): When …". The list
 * number is the task's ID (T1, T2, …); critics score tasks by it and the gate checks every one.
 */
export function parseKeyTasks(md) {
  const out = [];
  for (const line of stripComments(section(md, 'Key Tasks')).split('\n')) {
    // "1. **Name** (must not fail): story" or a plain "1. Story (must not fail)".
    const bold = line.match(/^\s*(\d+)[.)]\s+\*\*([^*]+)\*\*\s*(?:\(([^)]*)\))?/);
    const plain = !bold && line.match(/^\s*(\d+)[.)]\s+(\S.*)$/);
    if (bold) out.push({ id: `T${bold[1]}`, name: bold[2].trim(), critical: /must not fail|critical/i.test(bold[3] || '') });
    else if (plain) {
      const text = plain[2].replace(/[*_`]/g, '').trim();
      const name = text.replace(/\s*\((?:[^)]*)\)\s*/g, ' ').split(/:\s|\s[—–]\s/)[0].trim().slice(0, 80);
      out.push({ id: `T${plain[1]}`, name: name || text.slice(0, 80), critical: /\((?:[^)]*\b)?(?:must not fail|critical)\b[^)]*\)/i.test(text) });
    }
  }
  return out;
}

export function productModel(md) {
  return { keyTasks: parseKeyTasks(md), journeys: parseJourneys(md), concepts: parseConceptModel(md), scope: parseScope(md), features: parseFeatureMap(md), navigation: parseNavigation(md) };
}
