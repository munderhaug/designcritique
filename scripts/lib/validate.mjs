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
        errors.push(`${label}: "${id}" is not a principle ID in skills/principles/references`);
        badFindings.add(f.id ?? `#${i}`);
      }
    }
  });
  const known = new Map((keyTasks || []).map((k) => [k.id, k]));
  for (const t of data.tasks || []) {
    if (known.size && !t.id) warnings.push(`task "${t.task}": no id; use the key task's ID from PRODUCT.md (${[...known.keys()].join(', ')})`);
    else if (known.size && !known.has(t.id)) warnings.push(`task "${t.task}": id ${t.id} is not a key task in PRODUCT.md (${[...known.keys()].join(', ')})`);
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
