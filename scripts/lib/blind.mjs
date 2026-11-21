// The cold reading: a first look at the screens by a reviewer who is told nothing about the
// product, to learn what the screens themselves say it is (Krug's "trunk test", Don't Make Me
// Think, 2000; first impressions form before deliberate reading: Lindgaard et al., Behaviour &
// Information Technology 25(2), 2006). The reader gets numbered copies of the screenshots: no
// screen ids, titles, notes, journey names or file names, which would tell it the intent.
import fs from 'node:fs';
import path from 'node:path';

/** One standard light capture per screen, and for crawled or journey screens one per screen family. */
export function blindScreens(manifest, familyOf = () => null) {
  const seen = new Set();
  const out = [];
  for (const s of manifest.screens) {
    const cap = s.captures.find((c) => c.variant === 'light' && (c.device === 'standard' || c.device === 'frame')) || s.captures[0];
    if (!cap?.screenshot) continue;
    const family = familyOf(s) || s.id;
    if (seen.has(family)) continue;
    seen.add(family);
    out.push({ screen: s.id, screenshot: cap.screenshot });
  }
  return out;
}

/** Copy the screenshots to <run>/blind/NN.<ext> and write the key the reader never sees. */
export function writeBlindSet(runDir, screens, { max = 40 } = {}) {
  const dir = path.join(runDir, 'blind');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^\d+\.\w+$/.test(f)) fs.rmSync(path.join(dir, f));
  const key = [];
  screens.slice(0, max).forEach((s, i) => {
    const n = String(i + 1).padStart(2, '0');
    const file = `${n}${path.extname(s.screenshot).toLowerCase() || '.png'}`;
    fs.copyFileSync(path.join(runDir, s.screenshot), path.join(dir, file));
    key.push({ n: i + 1, file: `blind/${file}`, screen: s.screen });
  });
  fs.writeFileSync(path.join(dir, 'key.json'), JSON.stringify({ note: 'Maps the numbered copies to screens. Never give this file to the cold reader.', screens: key, left_out: Math.max(0, screens.length - max) }, null, 2));
  return key;
}

const str = (v) => typeof v === 'string' && v.trim().length > 0;
/** Problems with a cold reading's shape (empty when it's usable). */
export function validateReading(r) {
  const errors = [];
  if (!r || typeof r !== 'object') return ['not an object'];
  for (const k of ['product', 'audience', 'problem']) if (!str(r[k])) errors.push(`"${k}" must say what the reader took it for (or "can't tell", and why)`);
  if (!Array.isArray(r.tasks) || !r.tasks.every(str)) errors.push('"tasks" must be a list of the things a person can evidently do, most prominent first');
  if (r.screens != null && !Array.isArray(r.screens)) errors.push('"screens" must be a list');
  if (r.confidence != null && !['high', 'medium', 'low'].includes(r.confidence)) errors.push('"confidence" must be high, medium or low');
  return errors;
}
