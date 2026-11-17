// Turning raw findings into one finding per problem, for the report.
// 1. mergeAcrossSources: the same problem raised by several critics, or by a critic and a check,
//    on the same screen becomes one finding that keeps every source's evidence. Raised by two
//    independent critics is a sign of higher confidence.
//    A problem two deterministic sources found from different angles (an axe or detector
//    finding on the rendered page and a detector finding in the source) also becomes one.
// 2. groupChecksByCause: a deterministic check that fails on many screens is reported once,
//    with the list of screens.
import { similarity } from './compare.mjs';

const SEV = ['P0', 'P1', 'P2', 'P3'];
const worse = (a, b) => (SEV.indexOf(a) <= SEV.indexOf(b) ? a : b);
const ids = (f) => [f.rule, ...(f.basis || [])].filter(Boolean);
const samePlace = (a, b) => ['selector', 'region'].some((k) => a.element?.[k] && a.element[k] === b.element?.[k])
  || (a.element?.region && b.element?.region && similarity(a.element.region, b.element.region) >= 0.5);
/** Deterministic sources: the plugin's checks, the motion scanner and the third-party detectors. */
export const isDeterministic = (f) => f.source === 'check' || f.source === 'motion' || String(f.source || '').startsWith('detector:');
const isCheck = isDeterministic;
/** Which angle a deterministic finding saw: checks and axe read the rendered page; motion reads files. */
export const surfacesOf = (f) => (f.surfaces || (f.surface ? String(f.surface).split('+') : [f.source === 'motion' ? 'source' : 'rendered']));
const mainShared = (a, b) => (b.basis || []).includes(a.basis?.[0]) || (a.basis || []).includes(b.basis?.[0]);

/** Do two findings on the same screen describe the same problem? */
export function sameProblem(a, b) {
  if (a.screen !== b.screen) return false;
  // Two deterministic sources (never two findings of the same check) agree when they cite
  // the same main principle on the same screen: e.g. axe on the render, a detector in the code.
  if (isCheck(a) && isCheck(b)) return a.source !== b.source && mainShared(a, b);
  const linked = ids(b).includes(a.rule) || ids(a).includes(b.rule);
  if (!linked) return false;
  if (isCheck(a) !== isCheck(b)) {
    // A check measures one thing; a critic citing the check's principle on that screen means it.
    const [check, critic] = isCheck(a) ? [a, b] : [b, a];
    return (check.basis || []).includes(critic.rule);
  }
  // Same main principle: a looser wording match is enough; linked only through basis: stricter.
  const threshold = a.rule === b.rule ? 0.15 : 0.25;
  return samePlace(a, b) || similarity(a.title, b.title) >= threshold;
}

export function mergeAcrossSources(findings) {
  // Checks first (they carry measured elements), then the most severe.
  const order = [...findings].sort((a, b) => Number(isCheck(b)) - Number(isCheck(a)) || SEV.indexOf(a.severity) - SEV.indexOf(b.severity));
  const out = [];
  for (const f of order) {
    const into = out.find((g) => !g.raisedBy.includes(f.source) && sameProblem(g, f));
    if (!into) { out.push({ ...f, raisedBy: [f.source], also: [] }); continue; }
    into.raisedBy.push(f.source);
    into.also.push({ source: f.source, id: f.id, severity: f.severity, title: f.title, evidence: f.evidence, recommendation: f.recommendation });
    if (SEV.indexOf(f.severity) < SEV.indexOf(into.severity)) { into.severityFrom = f.source; into.severity = f.severity; }
    into.basis = [...new Set([...(into.basis || []), ...(f.basis || [])])];
    if (isCheck(into) && isCheck(f)) into.surfaces = [...new Set([...surfacesOf(into), ...surfacesOf(f)])];
    const critics = into.raisedBy.filter((s) => !isDeterministic({ source: s }));
    if (critics.length >= 2 || (critics.length && isCheck(into)) || (into.surfaces || []).length > 1) into.confidence = 'high';
  }
  for (const f of out) {
    const critics = f.raisedBy.filter((s) => !isDeterministic({ source: s }));
    f.agreement = critics.length >= 2 ? 'critics-agree'
      : critics.length && isCheck(f) ? 'check-and-critic'
        : (f.surfaces || []).length > 1 && f.raisedBy.length > 1 ? 'rendered-and-source' : null;
  }
  return out;
}

const GROUP_TITLES = {
  'CHK-TARGET': 'Touch targets below the platform minimum',
  'CHK-TEXT-SCALE': "Text doesn't scale with the user's text size",
  'CHK-TEXT-MIN': 'Text below the minimum size',
  'CHK-TEXT-CLIP': 'Text truncates',
  'CHK-TEXT-OVERLAP': 'Text overlaps other text',
  'CHK-OVERFLOW': 'Content is wider than the screen',
  'CHK-SAFE-AREA': (cause) => `Controls sit in the ${cause || 'system bar'} area`,
  'CHK-DARK': 'No dark appearance',
  'CHK-TOKEN-COLOR': 'Colours not in the design tokens',
  'CHK-TOKEN-SPACE': 'Spacing off the token scale',
  'CHK-TOKEN-TYPE': 'Font sizes off the token scale',
  'CHK-TOKEN-RADIUS': 'Corner radii off the token scale',
  'CHK-OBSCURED': 'Controls stay hidden under fixed bars',
  'CHK-LOOPING-MOTION': 'Decorative animation loops without end',
};

/** One finding per check rule (and cause, for safe areas), listing every screen it fails on. */
export function groupChecksByCause(findings) {
  const groups = new Map();
  const rest = [];
  for (const f of findings) {
    const groupable = f.source === 'check' || String(f.source || '').startsWith('detector:');
    if (!groupable || f.screen === '*') { rest.push(f); continue; }
    const key = f.rule === 'CHK-SAFE-AREA' ? `${f.rule}|${f.cause || ''}` : f.rule;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  for (const [key, list] of groups) {
    if (list.length === 1) { rest.push(list[0]); continue; }
    const first = [...list].sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity))[0];
    const screens = [...new Set(list.map((f) => f.screen))];
    const t = GROUP_TITLES[first.rule];
    const base = typeof t === 'function' ? t(first.cause) : t || first.title;
    rest.push({
      ...first,
      id: `chk-group-${key.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`,
      screen: '*',
      screens,
      title: `${base} (${screens.length} screens)`,
      severity: list.map((f) => f.severity).reduce(worse),
      basis: [...new Set(list.flatMap((f) => f.basis || []))],
      element: null,
      evidence: list.map((f) => `${f.screen}${f.platform ? ` (${f.platform})` : ''}: ${String(f.evidence).split('\n')[0]}`).join('\n'),
      instances: list.map((f) => ({ screen: f.screen, platform: f.platform, severity: f.severity, title: f.title, element: f.element, raisedBy: f.raisedBy })),
      raisedBy: [...new Set(list.flatMap((f) => f.raisedBy || [f.source]))],
      also: list.flatMap((f) => f.also || []),
      agreement: list.find((f) => f.agreement)?.agreement || null,
    });
  }
  return rest;
}
