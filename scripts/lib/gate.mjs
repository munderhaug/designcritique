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
