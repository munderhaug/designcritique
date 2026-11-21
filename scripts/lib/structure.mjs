// Whole-product structure from what was captured: coverage (which features, journeys and states
// were seen), the navigation graph (from the crawler's inventory) and deterministic continuity
// findings: no way back, dead ends, depth, inconsistent navigation, orphans, broken journeys,
// open loops, navigation order and out-of-scope features. Sources per finding: the principles
// index (IA-*, JOURNEY-*, SCOPE-*, SPEC-*).

import { loadVocabulary } from './vocabulary.mjs';

const norm = (s) => String(s || '').toLowerCase().normalize('NFKC');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Does the text show the term as a whole word or phrase (Unicode letters, so æøå work)? */
export function mentions(text, term) {
  if (!term) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc(norm(term))}($|[^\\p{L}\\p{N}])`, 'u').test(norm(text));
}

const ENGLISH = loadVocabulary(['en']);
/**
 * Which UI-stack states a captured screen shows (Hurff's ideal/empty/error/partial/loading, plus
 * offline and first run), from the state words of the prototype's languages.
 */
export function stateKindsOf(text, hint = '', vocab = ENGLISH) {
  const kinds = Object.entries(vocab.states).filter(([k, re]) => re.test(text) || (k === 'loading' && /- progressbar\b/.test(text)) || new RegExp(`\\b${k}\\b`, 'i').test(hint)).map(([k]) => k);
  return kinds.length ? kinds : ['ideal'];
}

/**
 * screens: [{ id, title, text, screenKey, journey?, hint }]
 * Returns coverage of features, journeys and states.
 */
export function coverage({ screens, model, journeysRun = [], inventory = null, vocab = ENGLISH }) {
  const invTexts = inventory ? inventory.states.map((s) => ({ id: s.id, depth: s.depth, text: s.snapshot || s.title })) : [];
  // Screens a person reaches by tapping from a crawl start's own page (mockup steps, journeys)
  // are reachable even when the crawl, started elsewhere, didn't get there.
  const tapped = new Set(screens.filter((s) => s.reachedByTaps).map((s) => s.id));
  const features = model.features.map((f) => {
    const seenIn = screens.filter((s) => f.seenAs.some((t) => mentions(s.text, t))).map((s) => s.id);
    const reach = [...invTexts.filter((s) => f.seenAs.some((t) => mentions(s.text, t))), ...seenIn.filter((id) => tapped.has(id)).map((id) => ({ id, depth: null }))];
    // Taps to reach the feature: the depth of a screen titled with it, else one more than the
    // depth of the screen where it's only a control.
    const titled = inventory ? inventory.states.filter((s) => f.seenAs.some((t) => mentions(s.title, t))) : [];
    return {
      feature: f.feature, phase: f.phase, task: f.task, problem: f.problem,
      seen: seenIn.length > 0, seenIn,
      reachable: inventory ? reach.length > 0 : null,
      depth: titled.length ? Math.min(...titled.map((s) => s.depth)) : reach.some((s) => s.depth != null) ? Math.min(...reach.filter((s) => s.depth != null).map((s) => s.depth)) + 1 : null,
    };
  });
  const journeys = model.journeys.map((j) => {
    const run = journeysRun.find((r) => r.id === j.id);
    return { id: j.id, critical: j.critical, scripted: !!run, completed: run ? run.brokenAt == null : false, brokenAt: run?.brokenAt ?? null };
  });
  for (const r of journeysRun) if (!journeys.some((j) => j.id === r.id)) journeys.push({ id: r.id, critical: r.critical, scripted: true, completed: r.brokenAt == null, brokenAt: r.brokenAt, notInProduct: true });
  const families = new Map();
  for (const s of screens) {
    const fam = families.get(s.screenKey) || { screenKey: s.screenKey, title: s.title, screens: [], kinds: new Set() };
    fam.screens.push(s.id);
    for (const k of stateKindsOf(s.text, s.hint, vocab)) fam.kinds.add(k);
    families.set(s.screenKey, fam);
  }
  const allKinds = ['ideal', ...Object.keys(vocab.states)];
  const states = [...families.values()].map((f) => ({ screenKey: f.screenKey, title: f.title, screens: f.screens, seen: allKinds.filter((k) => f.kinds.has(k)), notSeen: allKinds.filter((k) => !f.kinds.has(k)) }));
  const seenFeatures = features.filter((f) => f.seen).length;
  return {
    features, journeys, states,
    neverSeenStates: allKinds.filter((k) => !states.some((s) => s.seen.includes(k))),
    share: model.features.length ? seenFeatures / model.features.length : null,
  };
}

/** The names inside the first navigation landmark or tab list of an accessibility snapshot. */
export function navigationOf(snapshot) {
  const lines = String(snapshot || '').split('\n');
  const i = lines.findIndex((l) => /^\s*- (navigation|tablist)\b/.test(l));
  if (i < 0) return '';
  const indent = lines[i].search(/\S/);
  const names = [];
  for (const l of lines.slice(i + 1)) {
    if (l.trim() && l.search(/\S/) <= indent) break;
    const m = l.match(/- (?:button|link|tab|menuitem)\s+"([^"]+)"/);
    if (m) names.push(m[1]);
  }
  return names.join('\n');
}

/** Navigation graph at screen level from the crawler's inventory. */
export function screenGraph(inventory) {
  const byState = new Map(inventory.states.map((s) => [s.id, s]));
  const nodes = inventory.screens.map((sc, i) => {
    const sts = sc.states.map((id) => byState.get(id));
    return { id: `n${i + 1}`, screenKey: sc.screenKey, title: sc.title, kind: sc.kind, states: sc.states, depth: Math.min(...sts.map((s) => s.depth)), screenshot: sts[0].screenshot };
  });
  const nodeOf = new Map();
  for (const n of nodes) for (const id of n.states) nodeOf.set(id, n.id);
  const edges = new Map();
  for (const t of inventory.transitions) {
    const a = nodeOf.get(t.from); const b = nodeOf.get(t.to);
    if (!a || !b || a === b) continue;
    const key = `${a}>${b}`;
    const e = edges.get(key) || { from: a, to: b, labels: new Set() };
    e.labels.add(t.label);
    edges.set(key, e);
  }
  // The start screens: where each crawl start's first state sits (one start unless crawl.start lists several).
  const starts = [...new Set(inventory.states.filter((s) => s.depth === 0).map((s) => nodeOf.get(s.id)).filter(Boolean))];
  const unsure = new Set(uncoveredStates(inventory).map((u) => nodeOf.get(u.state)).filter(Boolean));
  return { nodes, edges: [...edges.values()].map((e) => ({ ...e, labels: [...e.labels] })), start: starts[0] || nodeOf.get(inventory.states[0]?.id), starts, unsure: [...unsure] };
}

/**
 * States the crawler couldn't fully explore because of the tooling, not the prototype: the path
 * to them doesn't replay, a tap failed (covered control, timeout), or a limit stopped it. What
 * they lead to is unknown, so they are "not covered", never dead ends or screens without a way back.
 */
export function uncoveredStates(inventory) {
  const out = [];
  for (const s of inventory?.states || []) {
    const failed = (s.actions || []).filter((a) => a.error);
    const limited = (s.actions || []).filter((a) => a.skipped === 'state limit reached');
    let reason = null;
    if (s.unexplored) reason = s.unexplored === 'replay failed' ? `replay failed${s.replayError ? `: ${s.replayError}` : ''}` : s.unexplored;
    else if (failed.length) reason = `${failed.length} tap(s) failed: ${failed.slice(0, 3).map((a) => `"${a.label}"`).join(', ')}${failed.length > 3 ? ', …' : ''}`;
    else if (limited.length) reason = 'state limit reached';
    else if (s.truncatedActions) reason = `only the first ${(s.actions || []).length} of ${s.truncatedActions} controls tried`;
    if (reason) out.push({ state: s.id, title: s.title, reason });
  }
  return out;
}

const reachableFrom = (start, edges) => {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) { const n = queue.shift(); for (const e of edges) if (e.from === n && !seen.has(e.to)) { seen.add(e.to); queue.push(e.to); } }
  return seen;
};

/**
 * Deterministic structure findings. Each has level, affected (screen titles or ids), rule, basis.
 * ctx: { model, coverage, inventory, graph, journeysRun, startText, screenIdsForState }
 */
export function structureFindings({ model, cov, inventory, graph, journeysRun = [], startText = '', finalTexts = {}, corpus = '', journeyKeys = {}, vocab = ENGLISH }) {
  const out = [];
  const add = (f) => out.push({ source: 'check', confidence: 'high', screen: '*', ...f });
  const critical = new Set(model.journeys.filter((j) => j.critical).map((j) => j.id));

  if (graph) {
    const titleOf = (id) => graph.nodes.find((n) => n.id === id)?.title || id;
    // No way back: screens from which no start screen can be reached. Only where the crawl is
    // sure: if anything reachable from the screen wasn't fully explored (a failed tap or replay,
    // a limit), the way back may be there, so the screen is listed as not covered instead.
    const starts = graph.starts?.length ? graph.starts : [graph.start];
    const unsure = new Set(graph.unsure || []);
    const back = graph.nodes.filter((n) => {
      const r = reachableFrom(n.id, graph.edges);
      return !starts.some((s) => r.has(s)) && ![...r].some((id) => unsure.has(id));
    });
    if (back.length) add({
      rule: 'CHK-NO-WAY-BACK', basis: ['JOURNEY-WAY-BACK', 'NN-H3'], level: 'system', category: 'journey', severity: 'P1',
      title: `No way back to ${titleOf(graph.start)} from ${back.length} screen(s)`,
      affected: back.map((n) => n.title), nodes: back.map((n) => n.id),
      evidence: `The crawler tapped every control on these screens and none leads, directly or through other screens, back to ${titleOf(graph.start)}: ${back.map((n) => n.title).join(', ')}.`,
      recommendation: 'Give every screen a way back: a back or close control on pushed screens and sheets, or persistent navigation (a tab bar) that includes the start screen.',
    });
    // Dead ends: states with no way out at all. A tap that failed is unknown, not "no way out".
    const dead = inventory.states.filter((s) => !s.unexplored && s.actions.length && !s.actions.some((a) => a.error) && !s.actions.some((a) => a.to && a.to !== s.id));
    const deadNone = inventory.states.filter((s) => !s.unexplored && !s.actions.length && s.depth > 0);
    const allDead = [...dead, ...deadNone];
    if (allDead.length) add({
      rule: 'CHK-DEAD-END', basis: ['JOURNEY-DEAD-END', 'NN-H3'], level: 'journey', category: 'journey', severity: 'P1',
      title: `${allDead.length} dead end(s): nothing on the screen leads anywhere`,
      affected: allDead.map((s) => s.title), states: allDead.map((s) => s.id),
      evidence: allDead.map((s) => `${s.title} (${s.id}): ${s.actions.length ? s.actions.map((a) => `"${a.label}" ${a.skipped ? `skipped: ${a.skipped}` : 'no change'}`).join(', ') : 'no controls'}`).join('\n'),
      recommendation: 'Offer a next step and a way back on every screen, especially confirmations and the end of a flow.',
    });
    // Inconsistent navigation: one label, different destinations.
    const byLabel = new Map();
    for (const e of graph.edges) for (const l of e.labels) { const m = byLabel.get(l) || new Set(); m.add(e.to); byLabel.set(l, m); }
    // Back, close and the like lead to different places by nature.
    const incons = [...byLabel].filter(([l, to]) => to.size > 1 && l.length > 1 && !vocab.back.test(l));
    if (incons.length) add({
      rule: 'CHK-NAV-INCONSISTENT', basis: ['IA-NAV-CONSISTENT', 'NN-H4'], level: 'system', category: 'ia', severity: 'P2', confidence: 'medium',
      title: `${incons.length} label(s) lead to different places`,
      affected: incons.map(([l]) => l),
      evidence: incons.map(([l, to]) => `"${l}" → ${[...to].map(titleOf).join(' / ')}`).join('\n'),
      recommendation: 'Make each label lead to one place, or rename the controls so the label says where it goes.',
    });
  }
  // Depth and orphans per feature.
  for (const f of cov.features) {
    const mapped = model.features.find((x) => x.feature === f.feature);
    if (f.depth != null && f.depth >= 4) add({
      rule: 'CHK-DEPTH', basis: ['IA-DEPTH', 'IA-PLACEMENT', 'LAW-FITTS'], level: 'system', category: 'ia', severity: /\b1\b|must/i.test(f.task || '') ? 'P1' : 'P2',
      title: `${f.feature} is ${f.depth} taps from the start`, affected: [f.feature], feature: f.feature,
      evidence: `Shortest path found by the crawler: ${f.depth} taps. Serves ${f.task || 'no listed key task'}.`,
      recommendation: 'Bring frequent or urgent features within two or three taps: a home shortcut, a tab, or a contextual entry where the need arises.',
    });
    if (inventory && f.seen && f.reachable === false) add({
      rule: 'CHK-ORPHAN', basis: ['IA-ORPHAN'], level: 'system', category: 'ia', severity: 'P2',
      title: `${f.feature} can't be reached from the start screen`, affected: [f.feature], feature: f.feature,
      evidence: `Seen on ${f.seenIn.join(', ')}, but no path the crawler could tap from the start screen reaches it${mapped?.seenAs?.length ? ` (looked for: ${mapped.seenAs.join(', ')})` : ''}.`,
      recommendation: 'Add an entry point in the navigation, or check whether the crawler was stopped by a guardrail (avoided control, depth or state limit).',
    });
  }
  // Journeys.
  for (const r of journeysRun) {
    if (r.brokenAt != null) add({
      rule: 'CHK-JOURNEY-BROKEN', basis: ['JOURNEY-BROKEN', 'TASK-WALK-Q2'], level: 'journey', category: 'journey', severity: r.critical || critical.has(r.id) ? 'P0' : 'P1',
      journey: r.id, title: `Journey "${r.title}" breaks at step ${r.brokenAt}: "${r.steps[r.brokenAt - 1]}"`, affected: r.screens,
      evidence: `${r.error}. Steps: ${r.steps.join(' → ')}.`,
      recommendation: `Make "${r.steps[r.brokenAt - 1]}" available where the journey needs it, or correct the journey in mockups.yaml if the label changed.`,
    });
    if (r.brokenAt == null && r.ends_at && !mentions(finalTexts[r.id] || '', r.ends_at)) add({
      rule: 'CHK-JOURNEY-END', basis: ['JOURNEY-CLOSE', 'NN-H1'], level: 'journey', category: 'journey', severity: 'P2',
      journey: r.id, title: `Journey "${r.title}" doesn't end at "${r.ends_at}"`, affected: r.screens.slice(-1),
      evidence: `The last step shows no "${r.ends_at}".`,
      recommendation: 'End the journey where the user expects to land, and confirm it there.',
    });
  }
  for (const j of model.journeys.filter((x) => x.leads_to)) {
    const target = model.journeys.find((x) => x.id === j.leads_to);
    const run = journeysRun.find((x) => x.id === j.id);
    if (!target || !run || run.brokenAt != null) continue;
    const next = target.steps.slice(0, 2);
    // With the crawl graph: can the journey's last screen reach, in one tap, the screen the next
    // journey's first step lands on? Without it: does the last screen offer the first step?
    const targetRun = journeysRun.find((x) => x.id === target.id);
    const lastKey = journeyKeys[j.id]?.[journeyKeys[j.id].length - 1];
    // Any screen inside the next journey counts (not its start screen, usually home).
    const targetKeys = targetRun ? (journeyKeys[target.id] || []).slice(1).filter(Boolean) : [];
    // Either kind of evidence closes the loop: the crawl graph can miss an edge (a failed tap, a
    // screen captured mid-transition with another key), and the screen can name the step.
    let closes = next.some((t) => mentions(finalTexts[j.id] || '', t));
    if (!closes && graph && lastKey && targetKeys.length) {
      const from = graph.nodes.find((n) => n.screenKey === lastKey);
      const tos = graph.nodes.filter((n) => targetKeys.includes(n.screenKey));
      closes = !!(from && tos.some((to) => from.id === to.id || graph.edges.some((e) => e.from === from.id && e.to === to.id)));
      // The last screen's exits weren't all explored: unknown, so not reported.
      if (!closes && from && (graph.unsure || []).includes(from.id)) closes = true;
    }
    if (!closes) add({
      rule: 'CHK-LOOP-OPEN', basis: ['JOURNEY-CLOSE'], level: 'journey', category: 'journey', severity: 'P2',
      journey: j.id, title: `"${j.title}" doesn't lead into "${target.title}"`, affected: run.screens.slice(-1),
      evidence: `PRODUCT.md says ${j.id} leads to ${target.id}, but its last screen offers none of: ${next.join(', ')}.`,
      recommendation: `End ${j.id} with a clear way into ${target.id} (for example "${target.steps[0]}").`,
    });
  }
  // Navigation order against the spec: the destinations in the navigation landmark (tab bar),
  // or the whole start screen when it has none.
  if (model.navigation.length && startText) {
    const navText = navigationOf(startText) || startText;
    const positions = model.navigation.map((d) => ({ d, i: norm(navText).search(new RegExp(`(^|[^\\p{L}])${esc(norm(d))}($|[^\\p{L}])`, 'u')) }));
    const missing = positions.filter((p) => p.i < 0).map((p) => p.d);
    const present = positions.filter((p) => p.i >= 0);
    const order = [...present].sort((a, b) => a.i - b.i).map((p) => p.d);
    const outOfOrder = order.join('|') !== present.map((p) => p.d).join('|');
    if (missing.length || outOfOrder) add({
      rule: 'CHK-SPEC-NAV-ORDER', basis: ['SPEC-NAV-ORDER', 'NN-H4'], level: 'system', category: 'spec', severity: 'P2',
      title: missing.length ? `Navigation is missing ${missing.length} destination(s) from the spec` : 'Navigation order differs from the spec',
      affected: ['start screen'],
      evidence: `Spec (## Navigation): ${model.navigation.join(', ')}. Start screen shows: ${order.join(', ') || 'none of them'}${missing.length ? `. Missing: ${missing.join(', ')}` : ''}.`,
      recommendation: 'Match the start screen to the navigation in the spec, or update the spec if the prototype is right.',
    });
  }
  // Out-of-scope features present.
  const outItems = (model.scope.out || []).filter((item) => mentions(corpus, item));
  if (outItems.length) add({
    rule: 'CHK-SCOPE-OUT', basis: ['SCOPE-OUT'], level: 'system', category: 'scope', severity: 'P2', confidence: 'medium',
    title: `${outItems.length} out-of-scope item(s) appear in the prototype`, affected: outItems,
    evidence: `PRODUCT.md lists as out of scope: ${outItems.join(', ')}; the captured screens mention them.`,
    recommendation: 'Remove them from this version, or move them into scope with a reason.',
  });
  return out;
}
