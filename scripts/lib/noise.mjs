// How much a critic's judgement varies when it judges the same screens twice ("occasion noise";
// Kahneman, Sibony & Sunstein, Noise, 2021). Compares two critique files from the same critic.
import { sameProblem } from './merge.mjs';

const SEV = ['P0', 'P1', 'P2', 'P3'];

export function compareJudgements(a, b) {
  const tasksA = new Map((a.tasks || []).filter((t) => typeof t.score === 'number').map((t) => [t.task.toLowerCase(), t]));
  const tasks = (b.tasks || []).filter((t) => typeof t.score === 'number' && tasksA.has(t.task.toLowerCase())).map((t) => {
    const x = tasksA.get(t.task.toLowerCase());
    return { task: t.task, a: x.score, b: t.score, diff: Math.abs(x.score - t.score), sameVerdict: x.verdict === t.verdict };
  });
  // Pair findings that describe the same problem (same screen, linked principle, similar wording or place).
  const fa = (a.findings || []).map((f) => ({ ...f, source: 'run-a' }));
  const fb = (b.findings || []).map((f) => ({ ...f, source: 'run-b' }));
  const used = new Set();
  const pairs = [];
  for (const x of fa) {
    const i = fb.findIndex((y, j) => !used.has(j) && sameProblem(x, y));
    if (i >= 0) { used.add(i); pairs.push({ a: x, b: fb[i], sevDiff: Math.abs(SEV.indexOf(x.severity) - SEV.indexOf(fb[i].severity)) }); }
  }
  const union = fa.length + fb.length - pairs.length;
  const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
  return {
    tasks,
    meanScoreDiff: mean(tasks.map((t) => t.diff)),
    maxScoreDiff: tasks.length ? Math.max(...tasks.map((t) => t.diff)) : null,
    verdictAgreement: tasks.length ? tasks.filter((t) => t.sameVerdict).length / tasks.length : null,
    findings: { a: fa.length, b: fb.length, both: pairs.length, overlap: union ? pairs.length / union : null },
    severityAgreement: pairs.length ? pairs.filter((p) => p.sevDiff === 0).length / pairs.length : null,
    onlyA: fa.filter((x) => !pairs.some((p) => p.a === x)).map((f) => `${f.screen}: ${f.title}`),
    onlyB: fb.filter((_, j) => !used.has(j)).map((f) => `${f.screen}: ${f.title}`),
  };
}
