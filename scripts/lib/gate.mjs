// The pass/fail bar for a run: no open finding at or above `fail_on`, and every key task scored
// at or above `target_score` by every critic that walked the whole task (the lowest such score
// counts, because model judges tend to grade generously). A critic that saw only some of a task's
// screens (a batch reviewer) doesn't score it, and a key task no critic scored fails the gate.
import { SEVERITIES, DEFAULT_GATE } from './config.mjs';

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The key task a critic's task entry is about: its id, else its name. */
export function keyTaskOf(t, keyTasks = []) {
  if (t.id && keyTasks.some((k) => k.id === t.id)) return t.id;
  return keyTasks.find((k) => norm(k.name) === norm(t.task))?.id || t.id || null;
}

/** Lowest whole-task score per task across critics; partial views (batches) don't score. */
export function taskScores(tasks, keyTasks = []) {
  const by = new Map();
  for (const t of tasks) {
    if (typeof t.score !== 'number' || t.coverage === 'partial') continue;
    const id = keyTaskOf(t, keyTasks);
    const key = id || norm(t.task);
    const name = keyTasks.find((k) => k.id === id)?.name || t.task;
    const prev = by.get(key);
    if (!prev || t.score < prev.score) by.set(key, { id, task: name, score: t.score, source: t.source });
  }
  return [...by.values()];
}

/** Lowest score per journey across critics (review mode). */
export function journeyScores(journeys) {
  return taskScores(journeys.map((j) => ({ task: j.journey, score: j.score, source: j.source })));
}

const DEAD = new Set(['CHK-DEAD-END', 'CHK-NO-WAY-BACK', 'CHK-JOURNEY-BROKEN']);

// Where a finding comes from, so a gate reason says whether a measurement, a reviewer's judgement
// or both are behind it: "check" (deterministic checks, motion and detectors) or "critic".
const isCheck = (src) => src === 'check' || src === 'motion' || String(src).startsWith('detector');
export function findingOrigin(f) {
  const by = f.raisedBy?.length ? f.raisedBy : [f.source || 'check'];
  const checks = by.some(isCheck); const critics = by.some((s) => !isCheck(s));
  return checks && critics ? 'check + critic' : critics ? 'critic' : 'check';
}

/**
 * incomplete: what the run is missing or lost (a check step that crashed, a capture that didn't
 * finish, findings dropped as invalid, key tasks that couldn't be read). A run with holes in its
 * evidence hasn't passed: each entry fails the gate as a [tooling] reason, apart from the design.
 */
export function evaluateGate({ findings, tasks = [], critics = [], journeys = [], coverage = null, criticalJourneys = [], keyTasks = [], incomplete = [] }, gate = DEFAULT_GATE) {
  const reasons = incomplete.map((r) => `[tooling] ${r}`);
  // Review mode: the must-not-fail journeys have no dead end, no missing way back and no broken step.
  if (gate.no_dead_end_on_critical !== false && criticalJourneys.length) {
    for (const cj of criticalJourneys) {
      const titles = new Set(cj.screens || []);
      const hit = findings.filter((f) => DEAD.has(f.rule) && (f.journey === cj.id || (f.affected_screens || []).some((s) => titles.has(s))));
      if (hit.length) reasons.push(`[check] must-not-fail journey "${cj.title || cj.id}" has ${hit.map((f) => f.rule.replace('CHK-', '').toLowerCase()).join(', ')}`);
      const blocked = journeys.filter((j) => j.journey === cj.id && j.verdict === 'blocked');
      if (blocked.length) reasons.push(`[critic] must-not-fail journey "${cj.title || cj.id}" judged blocked by ${blocked.map((j) => j.source).join(', ')}`);
    }
  }
  if (gate.journey_target_score != null) {
    for (const s of journeyScores(journeys)) if (s.score < gate.journey_target_score) reasons.push(`[critic] journey "${s.task}" scored ${s.score} (target ${gate.journey_target_score}, by ${s.source})`);
  }
  if (gate.min_feature_coverage != null && coverage?.share != null && coverage.share < gate.min_feature_coverage) {
    reasons.push(`[capture] only ${Math.round(coverage.share * 100)}% of the feature map was captured (minimum ${Math.round(gate.min_feature_coverage * 100)}%)`);
  }
  if (gate.fail_on && gate.fail_on !== 'none') {
    const limit = SEVERITIES.indexOf(gate.fail_on);
    const blocking = findings.filter((f) => SEVERITIES.indexOf(f.severity) <= limit);
    for (const origin of ['check', 'check + critic', 'critic']) {
      const n = blocking.filter((f) => findingOrigin(f) === origin).length;
      if (n) reasons.push(`[${origin}] ${n} open finding(s) at ${gate.fail_on} or worse`);
    }
  }
  const scores = taskScores(tasks, keyTasks);
  if (gate.target_score != null) {
    if (!critics.length) reasons.push('[critic] no critic has run, so key tasks are unscored');
    else if (!scores.length) reasons.push('[critic] no critic scored the key tasks');
    else {
      for (const k of keyTasks) {
        if (!scores.some((s) => s.id === k.id)) reasons.push(`[critic] key task ${k.id} "${k.name}"${k.critical ? ' (must not fail)' : ''} was not scored by a critic that walked the whole task`);
      }
    }
    for (const s of scores) if (s.score < gate.target_score) reasons.push(`[critic] ${s.id ? `${s.id} ` : ''}"${s.task}" scored ${s.score} (target ${gate.target_score}, by ${s.source})`);
  }
  // Gate off: nothing fails; the reasons are kept as what would have counted.
  return { pass: gate.enabled === false ? true : reasons.length === 0, off: gate.enabled === false, reasons, scores, journeyScores: journeyScores(journeys), gate };
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
