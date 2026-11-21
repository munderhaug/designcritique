// Validates a critic's JSON (critique/*.json) against the schema, the run's screens and the
// principle IDs. Used by the report renderer and by the PostToolUse hook.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'critic-output.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

let cachedIds = null;
/** Principle IDs from the citation index (skills/principles/references/*.md, first table column). */
export function principleIds() {
  if (cachedIds) return cachedIds;
  const dir = path.join(ROOT, 'skills', 'principles', 'references');
  const ids = new Set(['TASK-FIT']);
  for (const f of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of text.matchAll(/^\|\s*`([A-Z][A-Z0-9.-]+)`/gm)) ids.add(m[1]);
  }
  cachedIds = ids;
  return ids;
}

// ---------- nearest principle ID, for a critic that cited one that doesn't exist ----------
const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const tokenSim = (a, b) => {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return 0.8;
  if (/\d/.test(a) && a.replace(/\D/g, '') === b.replace(/\D/g, '')) return 0.7; // 4 and H4
  const sim = 1 - lev(a, b) / Math.max(a.length, b.length);
  return sim >= 0.75 ? sim * 0.8 : 0;
};

/**
 * Real principle IDs closest to an invented one (FITTS → LAW-FITTS), best first: one when it is
 * clearly closest, up to three when several are as close, none when nothing is.
 */
export function suggestIds(bad, ids = principleIds()) {
  const bare = (x) => String(x).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const exact = [...ids].find((id) => bare(id) === bare(bad));
  if (exact) return [exact];
  const want = String(bad || '').toUpperCase().split(/[-_. ]+/).filter(Boolean);
  if (!want.length) return [];
  const scored = [];
  for (const id of ids) {
    const have = id.split(/[-.]+/);
    // Each word of the invented ID against its best match in the real one; words of the real ID
    // that match nothing count against it a little, so GESTALT-FIGURE beats GESTALT-REGION.
    const matched = want.map((w) => Math.max(...have.map((h) => tokenSim(w, h))));
    const unused = have.filter((h) => !want.some((w) => tokenSim(w, h) > 0)).length;
    const score = matched.reduce((a, b) => a + b, 0) / want.length - unused * 0.1;
    if (score >= 0.3) scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score || lev(bad, a.id) - lev(bad, b.id));
  if (!scored.length) return [];
  if (scored.length === 1 || scored[0].score - scored[1].score >= 0.15) return [scored[0].id];
  return scored.filter((x) => scored[0].score - x.score < 0.15).slice(0, 3).map((x) => x.id);
}
export const suggestId = (bad, ids) => suggestIds(bad, ids)[0] || null;

/**
 * Replace a principle ID that doesn't exist with the real one it clearly meant (exactly one near
 * match: FITTS → LAW-FITTS), in place, so a mistyped citation doesn't cost the whole finding.
 * Ambiguous or unknown IDs are left for validation to reject. Returns what it changed.
 */
export function repairPrincipleIds(data, ids = principleIds()) {
  const repairs = [];
  const fix = (id) => {
    if (typeof id !== 'string' || ids.has(id)) return id;
    const near = suggestIds(id, ids);
    if (near.length !== 1) return id;
    repairs.push({ from: id, to: near[0] });
    return near[0];
  };
  for (const f of data?.findings || []) {
    if (!f || typeof f !== 'object') continue;
    const before = repairs.length;
    if (f.rule) f.rule = fix(f.rule);
    if (Array.isArray(f.basis)) f.basis = [...new Set(f.basis.map(fix))];
    for (const r of repairs.slice(before)) r.finding = f.id ?? null;
  }
  for (const s of data?.strengths || []) if (Array.isArray(s?.basis)) s.basis = [...new Set(s.basis.map(fix))];
  return repairs;
}

/**
 * @param data parsed critic JSON
 * @param opts.screens optional Set of screen ids in the run
 * @returns {{ errors: string[], warnings: string[], badFindings: Set<string> }}
 */
export function validateCritique(data, { screens, keyTasks } = {}) {
  const errors = [];
  const warnings = [];
  const badFindings = new Set();
  if (!validateSchema(data)) {
    for (const e of validateSchema.errors) {
      const where = e.instancePath || '(root)';
      errors.push(`${where} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);
      const m = where.match(/^\/findings\/(\d+)/);
      if (m && data.findings?.[m[1]]) badFindings.add(data.findings[m[1]].id ?? `#${m[1]}`);
    }
  }
  if (!data || !Array.isArray(data.findings)) return { errors, warnings, badFindings };
  const ids = principleIds();
  const seen = new Set();
  data.findings.forEach((f, i) => {
    const label = `findings[${i}] (${f.id ?? 'no id'})`;
    if (f.id && seen.has(f.id)) { errors.push(`${label}: duplicate id`); badFindings.add(f.id); }
    seen.add(f.id);
    if (screens && f.screen && f.screen !== '*' && !screens.has(f.screen)) {
      errors.push(`${label}: unknown screen "${f.screen}" (known: ${[...screens].join(', ')})`);
      badFindings.add(f.id ?? `#${i}`);
    }
    for (const id of [f.rule, ...(f.basis || [])].filter(Boolean)) {
      if (!ids.has(id)) {
        const near = suggestIds(id, ids);
        errors.push(`${label}: "${id}" is not a principle ID in skills/principles/references${near.length ? `; did you mean ${near.join(' or ')}?` : ''} (valid IDs are listed in skills/critique/references/output-format.md)`);
        badFindings.add(f.id ?? `#${i}`);
      }
    }
  });
  const known = new Map((keyTasks || []).map((k) => [k.id, k]));
  for (const t of data.tasks || []) {
    if (known.size && !t.id) warnings.push(`task "${t.task}": no id; use the key task's ID from PRODUCT.md (${[...known.keys()].join(', ')})`);
    else if (known.size && !known.has(t.id)) warnings.push(`task "${t.task}": id ${t.id} is not a key task in PRODUCT.md (${[...known.keys()].join(', ')})`);
    if (t.score == null && t.verdict !== 'not-covered') warnings.push(`task "${t.task}": no score, but verdict ${t.verdict}; score it 0-10, or use not-covered when you didn't see its screens`);
    // Scores and verdicts follow the anchors in output-format.md; flag the ones that disagree.
    if (typeof t.score === 'number') {
      if (t.verdict === 'blocked' && t.score > 4) warnings.push(`task "${t.task}": verdict blocked but score ${t.score} (blocked scores 0-4)`);
      if (t.verdict !== 'blocked' && t.verdict !== 'not-covered' && t.score <= 4) warnings.push(`task "${t.task}": score ${t.score} means a step fails (0-4), but verdict is ${t.verdict}; use blocked`);
      if (t.verdict === 'supported' && t.score < 7) warnings.push(`task "${t.task}": verdict supported but score ${t.score} (supported scores 7-10)`);
    }
    for (const s of t.steps || []) {
      for (const fid of s.finding_ids || []) if (!seen.has(fid)) warnings.push(`task "${t.task}": step refers to unknown finding ${fid}`);
    }
  }
  return { errors, warnings, badFindings };
}

/** Key tasks of the run that holds a critique file (RUN_DIR/framing.md). */
export async function keyTasksForCritiqueFile(file) {
  const framing = path.join(path.dirname(path.dirname(path.resolve(file))), 'framing.md');
  if (!fs.existsSync(framing)) return undefined;
  const { parseKeyTasks } = await import('./product.mjs');
  return parseKeyTasks(fs.readFileSync(framing, 'utf8'));
}

/** Screens of the run that holds a critique file (RUN_DIR/critique/x.json → RUN_DIR/manifest.json). */
export function screensForCritiqueFile(file) {
  const manifestPath = path.join(path.dirname(path.dirname(path.resolve(file))), 'manifest.json');
  if (!fs.existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return new Set(manifest.screens.map((s) => s.id));
}
