// The pass/fail bar for a run: no open finding at or above `fail_on`, and every key task scored
// at or above `target_score` by every critic that scored it (the lowest score counts, because
// model judges tend to grade generously).
import { SEVERITIES, DEFAULT_GATE } from './config.mjs';

/** Lowest score per task across critics. */
export function taskScores(tasks) {
  const by = new Map();
  for (const t of tasks) {
    if (typeof t.score !== 'number') continue;
    const prev = by.get(t.task);
    if (!prev || t.score < prev.score) by.set(t.task, { task: t.task, score: t.score, source: t.source });
  }
  return [...by.values()];
}

export function evaluateGate({ findings, tasks = [], critics = [] }, gate = DEFAULT_GATE) {
  const reasons = [];
  if (gate.fail_on && gate.fail_on !== 'none') {
    const limit = SEVERITIES.indexOf(gate.fail_on);
    const blocking = findings.filter((f) => SEVERITIES.indexOf(f.severity) <= limit);
    if (blocking.length) reasons.push(`${blocking.length} open finding(s) at ${gate.fail_on} or worse`);
  }
  const scores = taskScores(tasks);
  if (gate.target_score != null) {
    if (!critics.length) reasons.push('no critic has run, so key tasks are unscored');
    else if (!scores.length) reasons.push('no critic scored the key tasks');
    for (const s of scores) if (s.score < gate.target_score) reasons.push(`"${s.task}" scored ${s.score} (target ${gate.target_score}, by ${s.source})`);
  }
  return { pass: reasons.length === 0, reasons, scores, gate };
}

/**
 * How good a rendered run is, for choosing between iterate rounds: passing the gate first, then
 * fewer P0, fewer P1, a higher lowest task score, fewer P2. Idea from AutoDesign (Yaxin Luo, MIT):
 * keep the best candidate, not the last one. A round no critic judged never beats one they did.
 */
export function roundStanding(merged) {
  const count = (sev) => (merged.findings || []).filter((f) => f.severity === sev).length;
  const scores = taskScores(merged.tasks || []);
  return {
    pass: !!merged.gate?.pass,
    judged: (merged.coverage?.critics || []).length > 0,
    p0: count('P0'), p1: count('P1'), p2: count('P2'),
    lowest: scores.length ? Math.min(...scores.map((s) => s.score)) : null,
  };
}

/** Negative when a ranks above b. */
export function compareStanding(a, b) {
  return (Number(b.pass) - Number(a.pass))
    || (Number(b.judged) - Number(a.judged))
    || (a.p0 - b.p0)
    || (a.p1 - b.p1)
    || ((b.lowest ?? -1) - (a.lowest ?? -1))
    || (a.p2 - b.p2);
}

/** rounds: [{ round, merged }] → the best one (earliest wins a tie, since it changed least). */
export function bestRound(rounds) {
  return [...rounds]
    .map((r) => ({ ...r, standing: roundStanding(r.merged) }))
    .sort((a, b) => compareStanding(a.standing, b.standing) || a.round - b.round)[0] || null;
}
