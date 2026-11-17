// Your verdicts on findings, kept across runs in <project>/.designcritique/decisions.yaml.
// A dismissed finding leaves the report and the gate; a re-rated one keeps its new severity.
// Critics get the file in their brief, so they don't raise a dismissed finding again without new
// evidence. Over time the file shows where the critics are miscalibrated (decide.mjs --list).
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { SEVERITIES } from './config.mjs';
import { idMatches } from './match.mjs';
import { similarity } from './compare.mjs';

export const DECISIONS_FILE = '.designcritique/decisions.yaml';
export const decisionsPath = (baseDir) => path.join(baseDir, DECISIONS_FILE);

export function loadDecisions(baseDir) {
  const p = decisionsPath(baseDir);
  if (!fs.existsSync(p)) return [];
  const raw = YAML.parse(fs.readFileSync(p, 'utf8')) || {};
  return (raw.decisions || []).filter((d) => d && (
    (d.kind === 'proposal' && d.item && ['accept', 'reject', 'defer'].includes(d.decision))
    || (d.rule && ['dismiss', 'severity', 'accept'].includes(d.decision))));
}

export function saveDecisions(baseDir, decisions) {
  const p = decisionsPath(baseDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const head = '# designcritique decisions: your verdicts on findings, applied to every run.\n' +
    '# decision: dismiss (false alarm or out of scope) | severity (re-rated) | accept (agreed, kept open)\n' +
    '# kind: proposal entries record your decision on a structural or scope proposal: accept | reject | defer\n';
  fs.writeFileSync(p, head + YAML.stringify({ decisions }));
}

const deterministic = (f) => f.source === 'check' || f.source === 'motion';
const where = (f) => f.element?.selector || f.element?.region || '';

/** Does decision d refer to finding f? */
export function decisionMatches(d, f) {
  if (d.kind === 'proposal') return false; // decisions on moves and scope match proposals, not findings
  if (d.screen && d.screen !== '*' && d.screen !== f.screen) return false;
  if (deterministic(f) && d.id) return d.id === f.id;
  const cites = [f.rule, ...(f.basis || [])].some((id) => idMatches(id, d.rule));
  if (!cites) return false;
  if (d.source && !(f.raisedBy || [f.source]).includes(d.source)) return false;
  if (!d.title) return true;
  return (d.element && d.element === where(f)) || similarity(d.title, f.title) >= 0.45;
}

/** Split findings into open ones (with re-rated severities) and the ones you dismissed. */
export function applyDecisions(findings, decisions) {
  const open = [];
  const decided = [];
  for (const f of findings) {
    const d = decisions.find((x) => decisionMatches(x, f));
    if (!d) { open.push(f); continue; }
    if (d.decision === 'dismiss') { decided.push({ ...f, decision: d }); continue; }
    if (d.decision === 'severity' && SEVERITIES.includes(d.severity) && d.severity !== f.severity) {
      open.push({ ...f, severity: d.severity, originalSeverity: f.severity, decision: d });
      decided.push({ ...f, decision: d });
      continue;
    }
    open.push({ ...f, decision: d });
  }
  return { open, decided };
}

/** A decision recorded from a finding in a run. */
export function decisionFromFinding(f, { decision, severity, reason, by, evalCandidate }) {
  const d = {
    screen: f.screen, rule: f.rule, source: f.source,
    title: f.title, decision,
    ...(decision === 'severity' ? { severity } : {}),
    reason: reason || '',
    ...(deterministic(f) ? { id: f.id } : {}),
    ...(where(f) ? { element: where(f) } : {}),
    originalSeverity: f.severity,
    date: new Date().toISOString().slice(0, 10),
    ...(by ? { by } : {}),
    ...(evalCandidate ? { eval_candidate: true } : {}),
  };
  return d;
}
