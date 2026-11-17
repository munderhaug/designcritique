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
export function validateCritique(data, { screens } = {}) {
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
  for (const t of data.tasks || []) {
    for (const s of t.steps || []) {
      for (const fid of s.finding_ids || []) if (!seen.has(fid)) warnings.push(`task "${t.task}": step refers to unknown finding ${fid}`);
    }
  }
  return { errors, warnings, badFindings };
}

/** Screens of the run that holds a critique file (RUN_DIR/critique/x.json → RUN_DIR/manifest.json). */
export function screensForCritiqueFile(file) {
  const manifestPath = path.join(path.dirname(path.dirname(path.resolve(file))), 'manifest.json');
  if (!fs.existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return new Set(manifest.screens.map((s) => s.id));
}
