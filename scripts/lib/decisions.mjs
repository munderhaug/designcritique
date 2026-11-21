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
import { isDeterministic } from './merge.mjs';

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

const deterministic = (f) => isDeterministic(f);
const where = (f) => f.element?.selector || f.element?.region || '';

/** Does decision d refer to finding f? */
export function decisionMatches(d, f) {
  if (d.kind === 'proposal') return false; // decisions on moves and scope match proposals, not findings
  if (d.screen && d.screen !== '*' && d.screen !== f.screen) return false;
  // A decision made on a check grouped over several screens names those screens: it covers the
  // same check on them (grouped again or alone), never the screens that fail later.
  if (deterministic(f) && d.id && Array.isArray(d.screens)) {
    if (f.rule !== d.rule || (d.cause ?? null) !== (f.cause ?? null)) return false;
    return f.screens ? f.screens.some((s) => d.screens.includes(s)) : d.screens.includes(f.screen);
  }
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
  for (const whole of findings) {
    const d = decisions.find((x) => decisionMatches(x, whole));
    if (!d) { open.push(whole); continue; }
    // Grouped over more screens than the decision covers: the rest stays open, undecided.
    let f = whole;
    if (whole.screens && Array.isArray(d.screens)) {
      const rest = whole.screens.filter((s) => !d.screens.includes(s));
      if (rest.length) {
        open.push(restrictToScreens(whole, rest));
        f = restrictToScreens(whole, whole.screens.filter((s) => d.screens.includes(s)));
      }
    }
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

/** A grouped check narrowed to some of its screens. */
export function restrictToScreens(f, screens) {
  const keep = new Set(screens);
  const instances = (f.instances || []).filter((i) => keep.has(i.screen));
  return {
    ...f, screens, instances,
    title: String(f.title).replace(/\(\d+ screens\)$/, `(${screens.length} screen${screens.length === 1 ? '' : 's'})`),
    evidence: String(f.evidence || '').split('\n').filter((l) => screens.some((s) => l.startsWith(`${s}:`) || l.startsWith(`${s} (`))).join('\n') || f.evidence,
    severity: instances.length ? instances.map((i) => i.severity).sort((a, b) => SEVERITIES.indexOf(a) - SEVERITIES.indexOf(b))[0] : f.severity,
  };
}

/** A decision recorded from a finding in a run. */
export function decisionFromFinding(f, { decision, severity, reason, by, evalCandidate }) {
  const d = {
    screen: f.screen, rule: f.rule, source: f.source,
    title: f.title, decision,
    ...(decision === 'severity' ? { severity } : {}),
    reason: reason || '',
    ...(deterministic(f) ? { id: f.id } : {}),
    ...(deterministic(f) && f.screens ? { screens: f.screens, ...(f.cause != null ? { cause: f.cause } : {}) } : {}),
    ...(where(f) ? { element: where(f) } : {}),
    originalSeverity: f.severity,
    date: new Date().toISOString().slice(0, 10),
    ...(by ? { by } : {}),
    ...(evalCandidate ? { eval_candidate: true } : {}),
  };
  return d;
}
