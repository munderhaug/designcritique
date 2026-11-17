// Language-specific words, from catalog/vocabulary.yaml plus a project's `vocabulary:` in
// mockups.yaml. Nothing language-specific is hard-coded in the checks or the crawler.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../catalog/vocabulary.yaml');
const KINDS = ['empty', 'error', 'loading', 'offline', 'first-run', 'partial'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B = '(?:^|[^\\p{L}\\p{N}])';
const E = '(?=$|[^\\p{L}\\p{N}])';
const alt = (words) => words.map((w) => (String(w).startsWith('re:') ? String(w).slice(3) : esc(String(w)).replace(/\s+/g, '\\s+'))).join('|');
const words = (list, exact) => (list.length ? new RegExp(exact ? `^\\s*(?:${alt(list)})\\s*$` : `${B}(?:${alt(list)})${E}`, 'iu') : /(?!)/);

/** Primary language subtags from <html lang> values or config ("nb-NO" → "nb"; "no" → "nb"). */
export function languagesOf(values = []) {
  const out = new Set(['en']);
  for (const v of values.flat().filter(Boolean)) {
    const l = String(v).toLowerCase().split(/[-_]/)[0];
    out.add(l === 'no' || l === 'nn' ? 'nb' : l);
  }
  return [...out];
}

/** { avoid, back, states: { empty, error, ... }, languages } as regular expressions. */
export function loadVocabulary(languages = ['en'], extra = {}) {
  const all = YAML.parse(fs.readFileSync(FILE, 'utf8'));
  const langs = languages.filter((l) => all[l]);
  const pick = (get) => [...langs.flatMap((l) => get(all[l]) || []), ...(get(extra) || [])];
  const ofs = pick((v) => (v.of ? [v.of] : []));
  const states = Object.fromEntries(KINDS.map((k) => [k, pick((v) => v.states?.[k])]));
  if (ofs.length) states.partial.push(`re:\\d+\\s+(?:${ofs.map(esc).join('|')})\\s+\\d+`);
  return {
    languages: langs,
    unknown: languages.filter((l) => !all[l]),
    avoid: words(pick((v) => v.avoid), false),
    back: words(pick((v) => v.back), true),
    states: Object.fromEntries(KINDS.map((k) => [k, words(states[k], false)])),
  };
}
