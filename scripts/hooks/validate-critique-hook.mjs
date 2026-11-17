#!/usr/bin/env node
// PostToolUse hook: when a critic's JSON is written to <run>/critique/*.json, validate it.
// Exit 2 sends the errors back to Claude so it fixes the file; anything else passes silently.
// Plugin hooks run in every project, so only files inside a designcritique run (a folder with
// manifest.json next to critique/) are checked.
import fs from 'node:fs';
import path from 'node:path';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  let event;
  try { event = JSON.parse(input || '{}'); } catch { process.exit(0); }
  const file = event?.tool_input?.file_path || event?.tool_input?.path;
  if (!file || !/[\\/]critique[\\/][^\\/]+\.json$/.test(file) || !fs.existsSync(file)) process.exit(0);
  if (!fs.existsSync(path.join(path.dirname(path.dirname(path.resolve(file))), 'manifest.json'))) process.exit(0);
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    console.error(`designcritique: ${file} is not valid JSON (${e.message}). Save only the critic's JSON object.`);
    process.exit(2);
  }
  let lib;
  // Dependencies are installed by setup.sh; until then, don't block the session.
  try { lib = await import('../lib/validate.mjs'); } catch { process.exit(0); }
  const { validateCritique, screensForCritiqueFile } = lib;
  const { errors } = validateCritique(data, { screens: screensForCritiqueFile(file) });
  if (!errors.length) process.exit(0);
  console.error(`designcritique: ${file} doesn't match the critic output format:\n- ${errors.slice(0, 15).join('\n- ')}` +
    (errors.length > 15 ? `\n- …and ${errors.length - 15} more` : '') +
    '\nFix the file (or ask the critic to return corrected JSON). Format: skills/critique/references/output-format.md');
  process.exit(2);
});
