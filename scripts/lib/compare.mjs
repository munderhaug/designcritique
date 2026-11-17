// Compare the findings of two runs: what was fixed, what is new, what is still open.
// Check and motion findings have deterministic ids; critic findings are matched by screen,
// principle and element, then by title similarity, because critics word things differently.
import fs from 'node:fs';
import path from 'node:path';

/** The newest earlier run folder next to runDir that has a findings.json. */
export function findPreviousRun(runDir) {
  const parent = path.dirname(path.resolve(runDir));
  const me = path.basename(path.resolve(runDir));
  const candidates = fs.readdirSync(parent, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name < me && fs.existsSync(path.join(parent, d.name, 'findings.json')))
    .map((d) => d.name).sort();
  return candidates.length ? path.join(parent, candidates[candidates.length - 1]) : null;
}

const words = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));
function similarity(a, b) {
  const A = words(a); const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
const deterministic = (f) => f.source === 'check' || f.source === 'motion';
const where = (f) => f.element?.selector || f.element?.region || '';

/**
 * @param base previous findings[] ; @param current current findings[]
 * @param currentScreens Set of screen ids captured in the current run
 */
export function compareFindings(base, current, currentScreens) {
  const unmatchedBase = new Set(base.map((_, i) => i));
  const pairs = new Map(); // current index -> base index

  // 1. exact id for deterministic findings
  const baseById = new Map();
  base.forEach((f, i) => { if (deterministic(f)) baseById.set(f.id, i); });
  current.forEach((f, ci) => {
    if (!deterministic(f)) return;
    const bi = baseById.get(f.id);
    if (bi != null && unmatchedBase.has(bi)) { pairs.set(ci, bi); unmatchedBase.delete(bi); }
  });
  // 2. critics: same source, screen and rule; then best title similarity (or same element)
  current.forEach((f, ci) => {
    if (pairs.has(ci) || deterministic(f)) return;
    let best = null;
    for (const bi of unmatchedBase) {
      const b = base[bi];
      if (deterministic(b) || b.screen !== f.screen) continue;
      const sameRule = b.rule === f.rule || (b.basis || []).some((x) => (f.basis || []).includes(x));
      if (!sameRule) continue;
      const score = (where(b) && where(b) === where(f) ? 1 : 0) + similarity(b.title, f.title) + (b.rule === f.rule ? 0.25 : 0);
      if (score >= 0.45 && (!best || score > best.score)) best = { bi, score };
    }
    if (best) { pairs.set(ci, best.bi); unmatchedBase.delete(best.bi); }
  });

  const SEV = ['P0', 'P1', 'P2', 'P3'];
  const persisting = [];
  const introduced = [];
  current.forEach((f, ci) => {
    if (pairs.has(ci)) {
      const b = base[pairs.get(ci)];
      persisting.push({ now: f, before: b, severityChange: SEV.indexOf(f.severity) - SEV.indexOf(b.severity) });
    } else introduced.push(f);
  });
  const fixed = [];
  const notRechecked = [];
  for (const bi of unmatchedBase) {
    const b = base[bi];
    if (b.screen !== '*' && currentScreens && !currentScreens.has(b.screen)) notRechecked.push(b);
    else fixed.push(b);
  }
  return { fixed, introduced, persisting, notRechecked };
}
