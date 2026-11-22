// Carrying the close-look batch reviewers' findings over from a base run for screens that did
// not change, so a re-run after a small edit sends only the changed screens to new batches.
// Independence comes first: a screen is unchanged only when everything a reviewer judged it
// against is byte-identical, and only findings about that one screen alone are carried. Anything
// that depends on the whole (journeys, tasks, system findings, challenges, scope, moves, the
// frame check) is always re-judged: the whole-view reviewer, Impeccable and the lenses still run
// on every screen. Called by scripts/report/briefs.mjs --base (scripts/run.mjs --base).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** The critic whose findings may carry, and the files they may come from: its batches only. */
export const CARRY_CRITICS = new Set(['anthropic-design']);
export const BATCH_FILE = /^(carried-)?anthropic-design-\d+\.json$/;

/** sha1 of a file's bytes, or null when it doesn't exist. */
export function hashFile(file) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

// Run-wide inputs every reviewer judges against: the frame, the design tokens, the content guide.
const SNAPSHOTS = [
  ['frame', (m) => m.framingSnapshot || 'framing.md'],
  ['DESIGN.md', (m) => m.designSnapshot || null],
  ['content guide', (m) => m.contentSnapshot || null],
];
// What a reviewer's brief says about a screen besides its pixels.
const SCREEN_FIELDS = ['title', 'platform', 'flow', 'step', 'notes', 'kind'];
const captureKey = (c) => `${c.platform}|${c.device}|${c.variant}`;

/**
 * Which screens of `manifest` are unchanged since `baseManifest`.
 * Unchanged: the same id in both runs, the same screen entry (title, notes, flow …), the same set
 * of captures (platform, device, variant), and each capture's screenshot (and its page data, when
 * both runs have it) byte-identical. If the frame, DESIGN.md or content guide snapshot differs,
 * nothing is unchanged.
 * @returns {{ unchanged: string[], changed: string[], reason: string|null }}
 */
export function unchangedScreens({ baseDir, baseManifest, runDir, manifest }) {
  const ids = (manifest?.screens || []).map((s) => s.id);
  const none = (reason) => ({ unchanged: [], changed: ids, reason });
  if (!baseManifest?.screens) return none('no base run');
  for (const [label, rel] of SNAPSHOTS) {
    const a = rel(baseManifest); const b = rel(manifest);
    const ha = a ? hashFile(path.join(baseDir, a)) : null;
    const hb = b ? hashFile(path.join(runDir, b)) : null;
    if (ha !== hb) return none(`${label} changed`);
  }
  const base = new Map(baseManifest.screens.map((s) => [s.id, s]));
  const unchanged = []; const changed = [];
  for (const s of manifest.screens) {
    const b = base.get(s.id);
    const same = b && sameScreen(b, s, baseDir, runDir);
    (same ? unchanged : changed).push(s.id);
  }
  return { unchanged, changed, reason: unchanged.length ? null : 'every screen changed' };
}

function sameScreen(b, s, baseDir, runDir) {
  if (SCREEN_FIELDS.some((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(s[k] ?? null))) return false;
  const bc = b.captures || []; const sc = s.captures || [];
  if (!sc.length || bc.length !== sc.length) return false;
  const byKey = new Map(bc.map((c) => [captureKey(c), c]));
  if (byKey.size !== bc.length) return false;
  for (const c of sc) {
    const o = byKey.get(captureKey(c));
    if (!o || !o.screenshot || !c.screenshot) return false;
    const h = hashFile(path.join(runDir, c.screenshot));
    if (!h || h !== hashFile(path.join(baseDir, o.screenshot))) return false;
    // Page data (names, roles, sizes the reviewers may read): stricter, never looser.
    if ((o.data || c.data) && hashFile(o.data && path.join(baseDir, o.data)) !== hashFile(c.data && path.join(runDir, c.data))) return false;
  }
  return true;
}

/** Is this finding about one screen alone, judged from that screen? */
function screenLevel(f, unchanged) {
  if (!f || typeof f.screen !== 'string' || f.screen === '*' || !unchanged.has(f.screen)) return false;
  if (f.level && f.level !== 'screen') return false;
  if (f.journey || f.move_to) return false;
  if (Array.isArray(f.affected_screens) && f.affected_screens.some((id) => id !== f.screen)) return false;
  return true;
}

/**
 * The base run's screen-level batch-reviewer findings on unchanged screens, one output per
 * source batch file (anthropic-design-2, …), each a valid critic object. The whole-view
 * reviewer's file never carries: it runs again on every screen.
 * Findings carried before keep the run they were first judged in.
 * @param critiques [{ file, data }] from the base run's critique/ folder
 * @param unchanged Set of unchanged screen ids
 * @param baseName the base run's folder name
 * @returns [{ critic, data }] where critic is the source name (for critique/carried-<critic>.json)
 */
export function carryFindings(critiques, unchanged, baseName) {
  const out = new Map();
  for (const { file, data } of critiques || []) {
    if (!data || !CARRY_CRITICS.has(data.critic) || !Array.isArray(data.findings) || !BATCH_FILE.test(path.basename(String(file)))) continue;
    const name = path.basename(String(file), '.json').replace(/^carried-/, '');
    const keep = data.findings.filter((f) => screenLevel(f, unchanged));
    if (!keep.length) continue;
    if (!out.has(name)) out.set(name, { critic: data.critic, method: `carried from ${baseName}`, findings: [] });
    const into = out.get(name);
    const seen = new Set(into.findings.map((f) => f.id));
    for (const f of keep) {
      const copy = structuredClone(f);
      // A prefix with the batch number keeps carried ids apart from each other and from the new
      // batches' ids in the same run.
      if (!f.carried_from) copy.id = `c${name.match(/(\d+)$/)?.[1] || ''}-${f.id}`;
      copy.carried_from = f.carried_from || baseName;
      let id = copy.id; let n = 2;
      while (seen.has(id)) id = `${copy.id}-${n++}`;
      copy.id = id; seen.add(id);
      into.findings.push(copy);
    }
  }
  return [...out].sort(([a], [b]) => a.localeCompare(b)).map(([critic, data]) => ({ critic, data }));
}

/** The screens a base run's batches looked at closely: its batch reviewers' screens, plus what it carried itself. */
export function closelyReviewed(baseDir) {
  const out = new Set();
  const plan = readJsonSafe(path.join(baseDir, 'briefs', 'plan.json'));
  for (const r of (plan?.stages || []).flat()) {
    if (!/^anthropic-design-\d+$/.test(r.name) || !Array.isArray(r.screens)) continue;
    if (fs.existsSync(path.join(baseDir, 'critique', `${r.name}.json`))) for (const id of r.screens) out.add(id);
  }
  for (const id of readJsonSafe(path.join(baseDir, 'carry.json'))?.skipped || []) out.add(id);
  return out;
}
const readJsonSafe = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** Remove a run's carried files and carry.json (a run without a base, or about to decide again). */
export function clearCarry(runDir) {
  const dir = path.join(runDir, 'critique');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/^carried-.*\.json$/.test(f)) fs.rmSync(path.join(dir, f));
  fs.rmSync(path.join(runDir, 'carry.json'), { force: true });
}

/**
 * Decide and write a run's carry-over from baseDir: RUN_DIR/carry.json and
 * critique/carried-<batch>.json. `judged` is the screen ids the new run's batches would look at,
 * or null when one reviewer sees every screen (then nothing is skipped or carried).
 * @returns {{ base, skipped: string[], changed: string[], reason: string|null, carried: object }}
 */
export function carryRun({ runDir, baseDir, manifest, judged }) {
  clearCarry(runDir);
  const base = path.basename(baseDir);
  const done = (r) => { fs.writeFileSync(path.join(runDir, 'carry.json'), `${JSON.stringify({ base, ...r }, null, 2)}\n`); return { base, ...r }; };
  if (!judged) return done({ skipped: [], changed: [], reason: 'one reviewer sees every screen; nothing to skip', carried: {} });
  const baseManifest = readJsonSafe(path.join(baseDir, 'manifest.json'));
  const cmp = unchangedScreens({ baseDir, baseManifest, runDir, manifest });
  const close = closelyReviewed(baseDir);
  const critDir = path.join(baseDir, 'critique');
  const critiques = fs.existsSync(critDir) ? fs.readdirSync(critDir).filter((f) => BATCH_FILE.test(f)).sort().map((f) => ({ file: f, data: readJsonSafe(path.join(critDir, f)) })).filter((c) => c.data) : [];
  // A batch finding that can't carry (across screens, a journey, the whole batch) is judged again:
  // every screen it touches keeps its batch, so the finding is neither carried nor lost.
  const keep = touchedByUncarried(critiques, baseDir, new Set(cmp.unchanged));
  const skipped = cmp.unchanged.filter((id) => judged.includes(id) && close.has(id) && !keep.has(id));
  const changed = judged.filter((id) => !skipped.includes(id));
  const kept = cmp.unchanged.filter((id) => keep.has(id));
  if (!skipped.length) return done({ skipped, changed, kept, reason: cmp.reason || (close.size ? 'no unchanged screen was looked at closely in the base run, or each one has a finding that is judged again' : 'the base run had no batch reviewers'), carried: {} });
  const carried = {};
  fs.mkdirSync(path.join(runDir, 'critique'), { recursive: true });
  for (const { critic, data } of carryFindings(critiques, new Set(skipped), base)) {
    fs.writeFileSync(path.join(runDir, 'critique', `carried-${critic}.json`), `${JSON.stringify(data, null, 2)}\n`);
    carried[critic] = data.findings.length;
  }
  return done({ skipped, changed, kept, reason: null, carried });
}

/** Screens touched by a base batch finding that can't carry; "*" means every screen of that batch. */
function touchedByUncarried(critiques, baseDir, unchanged) {
  const plan = readJsonSafe(path.join(baseDir, 'briefs', 'plan.json'));
  const batchScreens = new Map((plan?.stages || []).flat().filter((r) => Array.isArray(r.screens)).map((r) => [r.name, r.screens]));
  const out = new Set();
  for (const { file, data } of critiques) {
    for (const f of data.findings || []) {
      if (screenLevel(f, unchanged)) continue;
      const named = [f.screen, ...(Array.isArray(f.affected_screens) ? f.affected_screens : [])].filter((x) => typeof x === 'string');
      const ids = named.includes('*') ? batchScreens.get(path.basename(file, '.json').replace(/^carried-/, '')) || [...unchanged] : named;
      for (const id of ids) out.add(id);
    }
  }
  return out;
}
