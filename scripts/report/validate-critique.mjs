#!/usr/bin/env node
// Validate one or more critic JSON files. Exit 1 if any is invalid.
// Usage: node scripts/report/validate-critique.mjs <RUN_DIR>/critique/anthropic-design.json [...]
import fs from 'node:fs';
import { validateCritique, screensForCritiqueFile } from '../lib/validate.mjs';

let failed = false;
for (const file of process.argv.slice(2)) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error(`${file}: not valid JSON (${e.message})`); failed = true; continue; }
  const { errors, warnings } = validateCritique(data, { screens: screensForCritiqueFile(file) });
  for (const w of warnings) console.error(`${file}: warning: ${w}`);
  if (errors.length) { failed = true; for (const e of errors) console.error(`${file}: ${e}`); }
  else console.log(`${file}: valid (${data.findings.length} findings)`);
}
process.exit(failed ? 1 : 0);
