#!/usr/bin/env node
// Merge check, critic and Impeccable findings for a run; write findings.json, report.md, report.html.
//
// Usage: node scripts/report/render-report.mjs --run <runDir>
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, writeJson } from '../lib/config.mjs';
import { recommendStack, stackMarkdown } from '../lib/stack.mjs';
import { validateCritique } from '../lib/validate.mjs';
import { findPreviousRun, compareFindings } from '../lib/compare.mjs';
import { loadDecisions, applyDecisions, decisionsPath } from '../lib/decisions.mjs';
import { evaluateGate } from '../lib/gate.mjs';
import { section, assumptionsOf, titleOf } from '../lib/framing.mjs';
import { mergeAcrossSources, groupChecksByCause } from '../lib/merge.mjs';
import { productModel, parseKeyTasks } from '../lib/product.mjs';
import { iaMapSvg, iaMapMermaid, rankProposals } from '../lib/review-report.mjs';
import { DEFAULT_GATE, normalizeGate, CHECK_FILES } from '../lib/config.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: render-report.mjs --run <runDir>'); process.exit(2); }
const runDir = path.resolve(args.run);
const manifest = readJson(path.join(runDir, 'manifest.json'));
const checkFindings = CHECK_FILES.flatMap((f) => readJson(path.join(runDir, 'checks', f), []));
const notes = [
  ...readJson(path.join(runDir, 'checks', 'notes.json'), []),
  ...readJson(path.join(runDir, 'motion', 'notes.json'), []).map((note) => ({ screen: 'motion', note })),
  ...readJson(path.join(runDir, 'detectors', 'notes.json'), []).map((note) => ({ screen: 'detectors', note })),
];
const warnings = [...(manifest.warnings || [])];

const SEV = ['P0', 'P1', 'P2', 'P3'];
const DECISIONS_REL = '.designcritique/decisions.yaml';
const CATEGORIES = new Set(['task-fit', 'ux', 'content', 'visual', 'layout', 'typography', 'color', 'a11y', 'platform', 'tokens', 'journey', 'ia', 'scope', 'consistency', 'logic', 'spec', 'states', 'ethics']);
const screenIds = new Set(manifest.screens.map((s) => s.id));
// Key tasks (T1, T2, …) from the frame the run was judged against: critics score them by ID.
const keyTasks = manifest.framingSnapshot && fs.existsSync(path.join(runDir, manifest.framingSnapshot))
  ? parseKeyTasks(fs.readFileSync(path.join(runDir, manifest.framingSnapshot), 'utf8')) : [];
const screenOrder = new Map(manifest.screens.map((s, i) => [s.id, i]));

// ---------- critic outputs ----------
const critics = [];
const critiqueDir = path.join(runDir, 'critique');
if (fs.existsSync(critiqueDir)) {
  for (const file of fs.readdirSync(critiqueDir).filter((f) => f.endsWith('.json')).sort()) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(critiqueDir, file), 'utf8')); }
    catch (e) { warnings.push(`critique/${file} is not valid JSON; skipped (${e.message})`); continue; }
    if (!data || !Array.isArray(data.findings)) { warnings.push(`critique/${file} has no findings array; skipped`); continue; }
    critics.push({ file, data });
  }
}

const criticValidity = new Map();
function validCriticFinding(f, file) {
  const bad = criticValidity.get(file);
  if (bad && bad.has(f.id ?? '')) { warnings.push(`critique/${file}: finding ${f.id || '?'} dropped (fails validation)`); return false; }
  return true;
}

const all = checkFindings.map((f) => ({ ...f }));
let frameCheck = null;
const tasks = [];
const strengths = [];
const comparisons = [];
const journeysJudged = [];
const moves = [];
const scopeVerdicts = [];
const overallScores = [];
for (const { file, data } of critics) {
  const v = validateCritique(data, { screens: screenIds, keyTasks });
  criticValidity.set(file, v.badFindings);
  for (const e of v.errors) warnings.push(`critique/${file}: ${e}`);
  for (const w of v.warnings) warnings.push(`critique/${file}: ${w}`);
  const source = data.critic || path.basename(file, '.json');
  for (const f of data.findings) {
    if (!validCriticFinding(f, file)) continue;
    all.push({
      ...f,
      id: `${source}-${f.id}`.replace(new RegExp(`^${source}-${source}-`), `${source}-`),
      source,
      basis: Array.isArray(f.basis) && f.basis.length ? f.basis : [f.rule],
      category: CATEGORIES.has(f.category) ? f.category : 'ux',
      confidence: f.confidence || 'medium',
      mockup: manifest.screens.find((s) => s.id === f.screen)?.mockupId || null,
    });
  }
  if (data.frame_check && !frameCheck) frameCheck = data.frame_check;
  if (typeof data.frame_check?.score === 'number') overallScores.push({ source, score: data.frame_check.score });
  for (const t of data.tasks || []) tasks.push({ ...t, source, finding_ids: undefined, steps: (t.steps || []).map((s) => ({ ...s, finding_ids: (s.finding_ids || []).map((id) => `${source}-${id}`.replace(new RegExp(`^${source}-${source}-`), `${source}-`)) })) });
  for (const s of data.strengths || []) strengths.push({ ...s, source });
  for (const c of data.comparisons || []) comparisons.push({ ...c, source });
  for (const j of data.journeys || []) journeysJudged.push({ ...j, source });
  for (const m of data.moves || []) moves.push({ ...m, source });
  for (const v of data.scope || []) scopeVerdicts.push({ ...v, source });
}

// ---------- de-duplicate: same screen + same rule + same element, keep the more severe ----------
const byKey = new Map();
for (const f of all) {
  const key = [f.screen, f.platform || '', f.rule, f.element?.selector || f.element?.region || f.title].join('|');
  const prev = byKey.get(key);
  if (!prev || SEV.indexOf(f.severity) < SEV.indexOf(prev.severity)) {
    if (prev) f.alsoReportedBy = [...new Set([...(prev.alsoReportedBy || []), prev.source])];
    byKey.set(key, f);
  } else prev.alsoReportedBy = [...new Set([...(prev.alsoReportedBy || []), f.source])];
}
// ---------- your decisions (.designcritique/decisions.yaml) ----------
const decisions = loadDecisions(manifest.baseDir);
// One finding per problem: merge what several sources raised, group checks across screens.
const onePerProblem = groupChecksByCause(mergeAcrossSources([...byKey.values()]));
const { open, decided } = applyDecisions(onePerProblem, decisions);
const findings = open.sort((a, b) =>
  SEV.indexOf(a.severity) - SEV.indexOf(b.severity)
  || (a.screen === '*' ? -1 : b.screen === '*' ? 1 : (screenOrder.get(a.screen) ?? 0) - (screenOrder.get(b.screen) ?? 0))
  || a.rule.localeCompare(b.rule));
findings.forEach((f, i) => { f.n = i + 1; });
const counts = Object.fromEntries(SEV.map((s) => [s, findings.filter((f) => f.severity === s).length]));

// ---------- framing ----------
const framingText = manifest.framingSnapshot ? fs.readFileSync(path.join(runDir, manifest.framingSnapshot), 'utf8') : '';
const productTitle = titleOf(framingText) || 'Untitled product';
const firstSection = (...names) => names.map((n) => section(framingText, n)).find(Boolean) || '';
const framing = {
  title: productTitle === 'Product' ? (manifest.screens[0]?.mockupId ? path.basename(manifest.baseDir) : 'Untitled product') : productTitle,
  problem: firstSection('Problem', 'Product Purpose'),
  users: firstSection('Users'),
  context: firstSection('Context of use', 'Operating Context'),
  tasks: firstSection('Key tasks'),
  assumptions: assumptionsOf(framingText),
};

// ---------- compare with the previous run ----------
let comparison = null;
const baseDir = args['no-compare'] ? null : (args.base ? path.resolve(args.base) : findPreviousRun(runDir));
if (baseDir && fs.existsSync(path.join(baseDir, 'findings.json'))) {
  const base = readJson(path.join(baseDir, 'findings.json'));
  const c = compareFindings(base.findings || [], findings, screenIds);
  const nowIds = new Set(c.introduced.map((f) => f.id));
  for (const f of findings) f.status = nowIds.has(f.id) ? 'new' : 'still open';
  comparison = {
    base: baseDir, baseDate: base.generatedAt,
    fixed: c.fixed.map(({ id, screen, rule, severity, title, source }) => ({ id, screen, rule, severity, title, source })),
    introduced: c.introduced.map((f) => f.id),
    persisting: c.persisting.map((p) => ({ id: p.now.id, before: p.before.id, severityChange: p.severityChange })),
    notRechecked: c.notRechecked.map(({ id, screen, title }) => ({ id, screen, title })),
  };
  writeJson(path.join(runDir, 'compare.json'), comparison);
}

const stack = recommendStack({ productText: framingText, fallbackPlatform: manifest.screens[0]?.platform, findings, prototype: manifest.screens.some((s) => s.kind === 'html') });

// ---------- whole-product review (crawl, journeys, structure, consistency, lenses) ----------
const coverageData = readJson(path.join(runDir, 'coverage.json'), null);
const graph = readJson(path.join(runDir, 'graph.json'), null);
const consistencyInv = readJson(path.join(runDir, 'consistency.json'), null);
const journeysRun = manifest.journeys || [];
const productM = productModel(framingText);
const captureOf = (id) => { const sc = manifest.screens.find((x) => x.id === id); return sc && (sc.captures.find((c) => c.variant === 'light' && c.device === 'standard') || sc.captures[0]); };
const pageTitle = (id) => { const c = captureOf(id); try { return c?.data ? readJson(path.join(runDir, c.data)).fingerprint?.title || id : id; } catch { return id; } };
const criticalIds = new Set([...journeysRun.filter((j) => j.critical).map((j) => j.id), ...productM.journeys.filter((j) => j.critical).map((j) => j.id)]);
const criticalJourneys = journeysRun.filter((j) => criticalIds.has(j.id)).map((j) => ({ id: j.id, title: j.title, screens: j.screens.map(pageTitle) }));
const review = !!(coverageData || graph || journeysRun.length || moves.length || scopeVerdicts.length);
const proposals = review ? rankProposals({ moves, scope: scopeVerdicts, findings, decisions }) : [];
const flagged = new Map();
for (const f of findings) {
  const why = f.rule === 'CHK-NO-WAY-BACK' ? 'no way back' : f.rule === 'CHK-DEAD-END' ? 'dead end' : null;
  if (why) for (const t of f.affected_screens || []) flagged.set(t, flagged.has(t) ? `${flagged.get(t)}, ${why}` : why);
}

const gate = evaluateGate({ findings, tasks, critics: critics.map((c) => c.data.critic || c.file), journeys: journeysJudged, coverage: coverageData, criticalJourneys, keyTasks }, normalizeGate(manifest.gate || DEFAULT_GATE));

const merged = {
  keyTasks,
  generatedAt: new Date().toISOString(),
  run: runDir,
  framing: { ...framing, present: !!framingText, frameCheck },
  tasks, findings, strengths, comparisons, counts, stack,
  scores: { tasks: gate.scores, overall: overallScores },
  taste: { references: manifest.taste || [] },
  gate: { pass: gate.pass, reasons: gate.reasons, ...gate.gate },
  decided: decided.map(({ id, screen, rule, severity, title, source, decision }) => ({ id, screen, rule, severity, title, source, decision: decision.decision, newSeverity: decision.severity, reason: decision.reason })),
  decisionsFile: decisions.length ? decisionsPath(manifest.baseDir) : null,
  review: review ? { coverage: coverageData, journeys: journeysRun, journeysJudged, criticalJourneys, proposals, consistency: consistencyInv, graph: !!graph, journeyScores: gate.journeyScores } : null,
  compare: comparison && { base: comparison.base, fixed: comparison.fixed.length, new: comparison.introduced.length, stillOpen: comparison.persisting.length, notRechecked: comparison.notRechecked.length },
  coverage: {
    screens: manifest.screens.length,
    renders: manifest.screens.reduce((n, s) => n + s.captures.length, 0),
    critics: critics.map((c) => c.data.critic || c.file),
  },
  notes, warnings,
};
writeJson(path.join(runDir, 'findings.json'), merged);

// ---------- report.md ----------
const L = [];
const screenTitle = (id) => (id === '*' ? 'All screens' : manifest.screens.find((s) => s.id === id)?.title || id);
L.push(`# Design critique: ${framing.title}`, '', `${new Date().toISOString().slice(0, 10)} · ${merged.coverage.screens} screens · ${merged.coverage.renders} renders · critics: ${merged.coverage.critics.join(', ') || 'none yet (checks only)'}`, '');
L.push(`**Gate: ${gate.pass ? 'passed' : 'not passed'}** (fail on ${gate.gate.fail_on}, target score ${gate.gate.target_score ?? 'none'})${gate.pass ? '' : `: ${gate.reasons.join('; ')}`}.`, '');
L.push('## The problem', '');
if (!framingText) L.push('_No PRODUCT.md was provided, so task fit could not be judged. Run the frame skill first._', '');
else {
  if (framing.problem) L.push(framing.problem, '');
  if (framing.users) L.push('**Users**', '', framing.users, '');
  if (framing.tasks) L.push('**Key tasks**', '', framing.tasks, '');
  if (framing.assumptions.length) L.push('**Open assumptions**', '', ...framing.assumptions.map((a) => `- ${a}`), '');
}
if (frameCheck) L.push('## Fit to the problem', '', `**${frameCheck.fit}**: ${frameCheck.summary || ''}`, '');
if (tasks.length) {
  L.push('## Key tasks', '', '| Task | Verdict | Score | Why | Critic |', '|---|---|---|---|---|');
  for (const t of tasks) L.push(`| ${t.id ? `${t.id} ` : ''}${md(t.task)} | ${t.verdict} | ${typeof t.score === 'number' ? `${t.score}/10${t.coverage === 'partial' ? ' (partial view, not gated)' : ''}` : '–'} | ${md(t.summary || '')} | ${t.source} |`);
  L.push('');
  if (overallScores.length) L.push(`Overall: ${overallScores.map((o) => `${o.score}/10 (${o.source})`).join(', ')}. The gate uses the lowest task score.`, '');
}
if (comparison) {
  L.push('## Since last run', '', `Compared with ${path.basename(comparison.base)}: **${comparison.fixed.length} fixed**, **${comparison.introduced.length} new**, ${comparison.persisting.length} still open${comparison.notRechecked.length ? `, ${comparison.notRechecked.length} on screens not in this run` : ''}.`, '');
  if (comparison.fixed.length) L.push('Fixed:', '', ...comparison.fixed.map((f) => `- ~~${md(f.title)}~~ (${f.severity}, ${screenTitle(f.screen)})`), '');
  const worse = comparison.persisting.filter((p) => p.severityChange < 0);
  if (worse.length) L.push(`Got worse: ${worse.length} finding(s) rose in severity.`, '');
}
L.push('## Findings', '', SEV.map((s) => `${s}: ${counts[s]}`).join(' · '), '');
for (const sev of SEV) {
  const list = findings.filter((f) => f.severity === sev);
  if (!list.length) continue;
  L.push(`### ${sev}`, '');
  for (const f of list) {
    L.push(`**${f.n}. ${md(f.title)}**${f.status === 'new' ? ' _(new)_' : ''}${agreementNote(f) ? ` _(${agreementNote(f)})_` : ''}  `, `${whereOf(f)} · ${f.basis.join(', ')} · ${(f.raisedBy || [f.source]).join(' + ')}${f.confidence !== 'high' ? ` · ${f.confidence} confidence` : ''}`, '');
    L.push(`- Evidence: ${md(f.evidence).replace(/\n/g, '; ')}`);
    if (f.impact) L.push(`- Impact: ${md(f.impact)}`);
    L.push(`- Fix: ${md(f.recommendation)}`);
    for (const a of f.also || []) L.push(`- Also raised by ${a.source} (${a.severity}): ${md(a.title)}${a.evidence ? `. ${md(a.evidence).replace(/\n/g, '; ')}` : ''}`);
    L.push('');
  }
}
if (strengths.length) L.push('## What works', '', ...strengths.map((s) => `- ${md(s.text)}${s.screen && s.screen !== '*' ? ` (${screenTitle(s.screen)})` : ''}${s.basis?.length ? ` · ${s.basis.join(', ')}` : ''}`), '');
if (manifest.taste?.length) {
  L.push('## The direction you chose', '', `${manifest.taste.length} reference image(s) in taste/. The critics saw them as the intended direction; closeness isn't scored, and it never excuses a usability problem.`, '');
}
if (comparisons.length) {
  L.push('## Variant comparison', '');
  for (const c of comparisons) L.push(`- **${c.group}**: recommend ${c.recommended}${c.ranking ? ` (ranking: ${c.ranking.join(' > ')})` : ''}. ${md(c.reasons || '')}`);
  L.push('');
}
if (review) {
  if (coverageData) {
    L.push('## Coverage', '');
    if (coverageData.features.length) {
      const unseen = coverageData.features.filter((f) => !f.seen);
      L.push(`Features captured: **${coverageData.features.length - unseen.length} of ${coverageData.features.length}**${unseen.length ? `. Not seen in the capture (not covered, not necessarily missing): ${unseen.map((f) => f.feature).join(', ')}` : ''}.`, '');
    }
    if (coverageData.journeys.length) L.push(`Journeys: ${coverageData.journeys.map((j) => `${j.id} ${!j.scripted ? '(not scripted in mockups.yaml)' : j.completed ? '(completed)' : `(broke at step ${j.brokenAt})`}`).join(', ')}.`, '');
    if (coverageData.neverSeenStates.length) L.push(`States never captured on any screen: ${coverageData.neverSeenStates.join(', ')}.`, '');
    const kinds = ['ideal', 'empty', 'error', 'loading', 'partial', 'offline', 'first-run'];
    L.push('| Screen | ' + kinds.join(' | ') + ' |', '|---|' + kinds.map(() => '---').join('|') + '|');
    for (const st of coverageData.states.slice(0, 40)) L.push(`| ${md(st.title)} | ${kinds.map((k) => (st.seen.includes(k) ? '✓' : '·')).join(' | ')} |`);
    L.push('');
  }
  if (graph) L.push('## Information architecture', '', `${graph.nodes.length} screens and ${graph.edges.length} links found by tapping every control from the start screen, by depth.${flagged.size ? ` Flagged: ${[...flagged].map(([t, w]) => `${t} (${w})`).join(', ')}.` : ''}`, '', iaMapMermaid(graph), '');
  if (journeysRun.length) {
    L.push('## Journeys', '');
    for (const j of journeysRun) {
      const judged = journeysJudged.filter((x) => x.journey === j.id);
      L.push(`### ${md(j.title)}${criticalIds.has(j.id) ? ' (must not fail)' : ''}`, '', judged.length ? judged.map((x) => `${x.source}: **${x.verdict}**${typeof x.score === 'number' ? ` ${x.score}/10` : ''}${x.summary ? `. ${md(x.summary)}` : ''}`).join('  \n') : '_Not judged by a critic yet._', '');
      L.push('| Step | Tap | Screen | Reached | ' + (judged.map((x) => x.source).join(' | ') || 'Verdict') + ' |', '|---|---|---|---|' + (judged.map(() => '---').join('|') || '---') + '|');
      for (let k = 0; k <= j.steps.length; k++) {
        const sid = j.screens[k];
        const reached = sid ? 'yes' : j.brokenAt === k ? `**broken**: ${md(j.error || '')}` : '—';
        const cells = judged.map((x) => { const st = (x.steps || []).find((y) => y.step === k || y.screen === sid); return st ? `${st.verdict}${st.note ? `: ${md(st.note)}` : ''}` : ''; });
        L.push(`| ${k} | ${k ? md(j.steps[k - 1]) : 'start'} | ${sid ? md(pageTitle(sid)) : ''} | ${reached} | ${cells.join(' | ') || ''} |`);
      }
      L.push('');
    }
  }
  if (productM.features.length) {
    L.push('## Features and the problem', '', '| Feature | Problem part | Key task | Phase | Captured | Taps | Scope |', '|---|---|---|---|---|---|---|');
    for (const f of productM.features) {
      const c = coverageData?.features.find((x) => x.feature === f.feature);
      const v = scopeVerdicts.filter((x) => (x.feature || '').toLowerCase() === f.feature.toLowerCase()).map((x) => `${x.verdict} (${x.source})`).join(', ');
      L.push(`| ${md(f.feature)} | ${md(f.problem)} | ${md(f.task)} | ${f.phase || ''} | ${c ? (c.seen ? 'yes' : 'no') : ''} | ${c?.depth ?? ''} | ${v} |`);
    }
    const extra = scopeVerdicts.filter((x) => !productM.features.some((f) => f.feature.toLowerCase() === (x.feature || '').toLowerCase()));
    if (extra.length) L.push('', 'Not in the feature map: ' + extra.map((x) => `${md(x.feature)} (${x.verdict}, ${x.source})`).join(', ') + '.');
    L.push('');
  }
  if (proposals.length) {
    L.push('## Cut, add or move', '', 'Proposals, ranked by impact. None is applied automatically: record your decision with `/designcritique:decide <id> accept|reject|defer`.', '');
    for (const p of proposals) L.push(`- **${p.id}** ${p.type === 'move' ? `Move **${md(p.item)}**${p.from ? ` from ${md(p.from)}` : ''} to **${md(p.to)}**` : `${p.verdict[0].toUpperCase()}${p.verdict.slice(1)} **${md(p.item)}**`}: ${md(p.reason)} _(${p.impact} impact; ${p.sources.join(' + ')})_${p.decision ? ` · **${PAST[p.decision.decision] || p.decision.decision} by you**${p.decision.reason ? `: ${md(p.decision.reason)}` : ''}` : ''}`);
    L.push('');
  }
  if (consistencyInv) {
    L.push('## Consistency inventory', '');
    if (consistencyInv.components.length) L.push('Emphasised buttons: ' + consistencyInv.components.map((c) => `${c.signature} ×${c.count}`).join('; ') + '.');
    const multi = consistencyInv.icons.filter((i) => i.meanings.length > 1);
    L.push(`Icons: ${consistencyInv.icons.length} in use${multi.length ? `, ${multi.length} with more than one meaning (${multi.map((i) => i.meanings.join(' / ')).join('; ')})` : ''}.`);
    if (consistencyInv.terms.length) L.push('Terms to replace: ' + consistencyInv.terms.map((t) => `"${t.avoid}" → "${t.use}"`).join(', ') + '.');
    if (consistencyInv.formats.length) L.push('Amount formats: ' + consistencyInv.formats.map((f) => `${f.format} (${f.examples.join(', ')})`).join('; ') + '.');
    if (consistencyInv.figures.length) L.push('Figures that disagree: ' + consistencyInv.figures.map((f) => `${f.label}: ${f.values.map((v) => v.value).join(' vs ')}`).join('; ') + '.');
    L.push('');
  }
}
if (decided.length) {
  L.push('## Decided by you', '', `From ${DECISIONS_REL}. Dismissed findings are left out of the counts and the gate.`, '');
  for (const f of decided) L.push(`- ${f.decision.decision === 'dismiss' ? 'Dismissed' : `Re-rated ${f.severity} → ${f.decision.severity}`}: ${md(f.title)} (${screenTitle(f.screen)}, ${f.rule}, ${f.source})${f.decision.reason ? `. ${md(f.decision.reason)}` : ''}`);
  L.push('');
}
L.push(stackMarkdown(stack), '');
if (notes.length || warnings.length) L.push('## Notes', '', ...notes.map((n) => `- ${n.screen}: ${n.note}`), ...warnings.map((w) => `- Warning: ${w}`), '');
L.push('---', 'Principle IDs refer to the designcritique principles library (skills/principles). Severity follows Nielsen\'s frequency, impact and persistence, weighted by task criticality.');
fs.writeFileSync(path.join(runDir, 'report.md'), L.join('\n') + '\n');

const PAST = { accept: 'accepted', reject: 'rejected', defer: 'deferred' };
function whereOf(f) {
  if (f.screens) return `${f.screens.length} screens: ${f.screens.map(screenTitle).join(', ')}`;
  return `${screenTitle(f.screen)}${f.platform ? ` (${f.platform})` : ''}`;
}
const criticsOf = (f) => [...new Set((f.raisedBy || []).filter((s) => s !== 'check' && s !== 'motion' && !String(s).startsWith('detector:')))];
function agreementNote(f) {
  if (f.agreement === 'critics-agree') return `raised by ${criticsOf(f).length} critics: higher confidence`;
  if (f.agreement === 'check-and-critic') return 'measured by a check and raised by a critic';
  if (f.agreement === 'rendered-and-source') return 'found on the rendered screen and in its source';
  return '';
}
function md(s) { return String(s ?? '').replace(/\|/g, '\\|'); }

// ---------- report.html ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mdInline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

function reviewHtml() {
  const out = [];
  if (coverageData) {
    const kinds = ['ideal', 'empty', 'error', 'loading', 'partial', 'offline', 'first-run'];
    const unseen = coverageData.features.filter((f) => !f.seen);
    out.push(`<h2>Coverage</h2><div class="frame-box">${coverageData.features.length ? `<p>Features captured: <strong>${coverageData.features.length - unseen.length} of ${coverageData.features.length}</strong>${unseen.length ? `. Not seen in the capture (not covered, not necessarily missing): ${unseen.map((f) => esc(f.feature)).join(', ')}` : ''}.</p>` : ''}${coverageData.journeys.length ? `<p>Journeys: ${coverageData.journeys.map((j) => `${esc(j.id)} ${!j.scripted ? '(not scripted)' : j.completed ? '(completed)' : `<span class="broken">(broke at step ${j.brokenAt})</span>`}`).join(', ')}.</p>` : ''}${coverageData.neverSeenStates.length ? `<p>States never captured: ${coverageData.neverSeenStates.map(esc).join(', ')}.</p>` : ''}
<table class="matrix"><tr><th>Screen</th>${kinds.map((k) => `<th>${k}</th>`).join('')}</tr>${coverageData.states.slice(0, 40).map((st) => `<tr><td>${esc(st.title)}</td>${kinds.map((k) => `<td>${st.seen.includes(k) ? '✓' : '·'}</td>`).join('')}</tr>`).join('')}</table></div>`);
  }
  if (graph) out.push(`<h2>Information architecture</h2><p class="sub">${graph.nodes.length} screens and ${graph.edges.length} links found by tapping every control from the start screen; columns are taps from the start. Outlined: ${flagged.size ? [...flagged].map(([t, w]) => `${esc(t)} (${esc(w)})`).join(', ') : 'none'}. Dashed arrows lead back.</p><div class="iamap-wrap">${iaMapSvg(graph, flagged)}</div>`);
  for (const j of journeysRun) {
    const judged = journeysJudged.filter((x) => x.journey === j.id);
    const steps = [];
    for (let k = 0; k <= j.steps.length; k++) {
      const sid = j.screens[k];
      const cap = sid && captureOf(sid);
      const verdicts = judged.map((x) => { const st = (x.steps || []).find((y) => y.step === k || y.screen === sid); return st ? `<div class="v v-${esc(st.verdict)}">${esc(x.source)}: ${esc(st.verdict)}${st.note ? ` – ${esc(st.note)}` : ''}</div>` : ''; }).join('');
      steps.push(`<div class="jstep"><div class="tap">${k ? `${k}. tap “${esc(j.steps[k - 1])}”` : 'start'}</div>${cap ? `<img src="${esc(cap.screenshot)}" alt="${esc(pageTitle(sid))}">` : j.brokenAt === k ? `<div class="broken">Broken: ${esc(j.error || '')}</div>` : ''}${verdicts}</div>`);
      if (!sid) break;
    }
    out.push(`<h3>${esc(j.title)}${criticalIds.has(j.id) ? ' <small>must not fail</small>' : ''}</h3><p class="sub">${judged.map((x) => `${esc(x.source)}: <strong>${esc(x.verdict)}</strong>${typeof x.score === 'number' ? ` ${x.score}/10` : ''}${x.summary ? ` – ${esc(x.summary)}` : ''}`).join('<br>') || 'Not judged by a critic yet.'}</p><div class="jstrip">${steps.join('')}</div>`);
  }
  if (journeysRun.length) out.splice(out.length - journeysRun.length, 0, '<h2>Journeys</h2>');
  if (productM.features.length) out.push(`<h2>Features and the problem</h2><table><tr><th>Feature</th><th>Problem part</th><th>Key task</th><th>Phase</th><th>Captured</th><th>Taps</th><th>Scope</th></tr>${productM.features.map((f) => { const c = coverageData?.features.find((x) => x.feature === f.feature); return `<tr><td>${esc(f.feature)}</td><td>${esc(f.problem)}</td><td>${esc(f.task)}</td><td>${esc(f.phase || '')}</td><td>${c ? (c.seen ? 'yes' : 'no') : ''}</td><td>${c?.depth ?? ''}</td><td>${scopeVerdicts.filter((x) => (x.feature || '').toLowerCase() === f.feature.toLowerCase()).map((x) => `${esc(x.verdict)} <span class="meta">${esc(x.source)}</span>`).join(', ')}</td></tr>`; }).join('')}</table>`);
  if (proposals.length) out.push(`<h2>Cut, add or move</h2><p class="sub">Proposals, ranked by impact. None is applied automatically: decide with <code>/designcritique:decide &lt;id&gt; accept|reject|defer</code>.</p><ol class="plain">${proposals.map((p) => `<li><strong>${esc(p.id)}</strong> ${p.type === 'move' ? `Move <strong>${esc(p.item)}</strong>${p.from ? ` from ${esc(p.from)}` : ''} to <strong>${esc(p.to)}</strong>` : `${esc(p.verdict[0].toUpperCase() + p.verdict.slice(1))} <strong>${esc(p.item)}</strong>`}: ${esc(p.reason)} <span class="meta">${esc(p.impact)} impact · ${esc(p.sources.join(' + '))}</span>${p.decision ? ` <span class="agree">${esc(PAST[p.decision.decision] || p.decision.decision)} by you</span>` : ''}</li>`).join('')}</ol>`);
  if (consistencyInv) {
    const multi = consistencyInv.icons.filter((i) => i.meanings.length > 1);
    out.push(`<h2>Consistency inventory</h2><div class="frame-box">${consistencyInv.components.length ? `<p><strong>Emphasised buttons</strong><br>${consistencyInv.components.map((c) => `${esc(c.signature)} ×${c.count} <span class="meta">${esc(c.examples.join(', '))}</span>`).join('<br>')}</p>` : ''}<p><strong>Icons</strong>: ${consistencyInv.icons.length} in use${multi.length ? `; more than one meaning: ${multi.map((i) => esc(i.meanings.join(' / '))).join('; ')}` : ''}.</p>${consistencyInv.terms.length ? `<p><strong>Terms</strong>: ${consistencyInv.terms.map((t) => `“${esc(t.avoid)}” → “${esc(t.use)}”`).join(', ')}</p>` : ''}${consistencyInv.formats.length ? `<p><strong>Amount formats</strong>: ${consistencyInv.formats.map((f) => `${esc(f.format)} (${esc(f.examples.join(', '))})`).join('; ')}</p>` : ''}${consistencyInv.figures.length ? `<p><strong>Figures that disagree</strong>: ${consistencyInv.figures.map((f) => `${esc(f.label)}: ${esc(f.values.map((v) => v.value).join(' vs '))}`).join('; ')}</p>` : ''}</div>`);
  }
  return out.join('\n');
}

function findingItem(f, anchor) {
  const badge = f.agreement === 'critics-agree' ? ` <span class="agree">${criticsOf(f).length} critics</span>` : f.agreement === 'check-and-critic' ? ' <span class="agree">check + critic</span>' : f.agreement === 'rendered-and-source' ? ' <span class="agree">rendered + source</span>' : '';
  const where = f.screens ? `<div class="meta">On ${f.screens.length} screens: ${f.screens.map((id) => esc(screenTitle(id))).join(', ')}</div>` : '';
  const also = (f.also || []).map((a) => `<p><em>Also raised by ${esc(a.source)} (${esc(a.severity)}):</em> ${esc(a.title)}${a.evidence ? `. ${mdInline(a.evidence)}` : ''}</p>`).join('');
  return `<li${anchor ? ` id="${anchor}"` : ''} value="${f.n}"><span class="sev sev-${f.severity}">${f.severity}</span> <strong>${esc(f.title)}</strong>${f.status === 'new' ? ' <span class="new">new</span>' : ''}${badge}<div class="meta">${esc(f.basis.join(', '))} · ${esc((f.raisedBy || [f.source]).join(' + '))}${f.platform && !f.screens ? ` · ${esc(f.platform)}` : ''}</div>${where}<details><summary>Evidence and fix</summary><p>${mdInline(f.evidence)}</p>${f.impact ? `<p><em>Impact:</em> ${mdInline(f.impact)}</p>` : ''}<p><em>Fix:</em> ${mdInline(f.recommendation)}</p>${also}</details></li>`;
}

function screenCard(screen) {
  const main = screen.captures.find((c) => c.variant === 'light' && (c.device === 'standard' || c.device === 'frame')) || screen.captures[0];
  const others = screen.captures.filter((c) => c !== main && c.variant !== 'light');
  const own = findings.filter((f) => f.screen === screen.id || f.screens?.includes(screen.id));
  const elementOn = (f) => (f.screens ? f.instances?.find((i) => i.screen === screen.id && (!i.platform || i.platform === main.platform))?.element : f.element);
  const vw = main.viewport?.width || 1;
  const vh = main.viewport?.height || 1;
  const markers = own.filter((f) => elementOn(f)?.box && elementOn(f).box.y < vh && (f.screens || !f.platform || f.platform === main.platform)).map((f) => {
    const b = elementOn(f).box;
    const st = `left:${(b.x / vw) * 100}%;top:${(b.y / vh) * 100}%;width:${(Math.max(b.w, 8) / vw) * 100}%;height:${(Math.max(b.h, 8) / vh) * 100}%`;
    return `<a class="box sev-${f.severity}" style="${st}" href="#f${f.n}" title="${esc(f.title)}"><span>${f.n}</span></a>`;
  }).join('');
  return `<section class="screen" id="s-${esc(screen.id)}">
  <h3>${esc(screen.title)} <small>${esc(screen.id)} · ${esc(screen.platform)}${screen.flow ? ` · ${esc(screen.flow)} ${screen.step ?? ''}` : ''}</small></h3>
  <div class="screen-body">
    <figure class="shot"><div class="frame"><img src="${esc(main.screenshot)}" alt="${esc(screen.title)}, ${esc(main.variant)}">${markers}</div><figcaption>${esc(main.deviceName)} · ${esc(main.variant)}</figcaption></figure>
    <div class="side">
      <ol class="flist">${own.map((f) => `${findingItem(f, f.screens ? '' : `f${f.n}`)}`).join('') || '<li class="none">No findings for this screen.</li>'}</ol>
      ${others.length ? `<div class="thumbs">${others.map((c) => `<figure><a href="${esc(c.screenshot)}"><img src="${esc(c.screenshot)}" alt="${esc(c.variant)}"></a><figcaption>${esc(c.platform)} ${esc(c.device)} · ${esc(c.variant)}</figcaption></figure>`).join('')}</div>` : ''}
    </div>
  </div>
</section>`;
}

const global = findings.filter((f) => f.screen === '*');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design critique: ${esc(framing.title)}</title>
<style>
:root { --bg:#fff; --fg:#16181d; --muted:#5b6170; --line:#e3e6ec; --card:#f6f7f9; --p0:#b3261e; --p1:#d9480f; --p2:#b08800; --p3:#5b6170; }
@media (prefers-color-scheme: dark) { :root { --bg:#121418; --fg:#eceef3; --muted:#a8aebb; --line:#2a2e36; --card:#1a1d23; --p0:#ff8a80; --p1:#ffab70; --p2:#f2cc60; --p3:#a8aebb; } }
* { box-sizing:border-box; } body { margin:0; font:15px/1.5 system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--fg); }
main { max-width:1100px; margin:0 auto; padding:32px 20px 80px; }
h1 { font-size:28px; margin:0 0 4px; } h2 { font-size:20px; margin:40px 0 12px; border-bottom:1px solid var(--line); padding-bottom:6px; }
h3 { font-size:17px; margin:0 0 12px; } h3 small, .meta, figcaption, .sub { color:var(--muted); font-size:13px; font-weight:400; }
.frame-box, .task, .screen { background:var(--card); border-radius:12px; padding:16px; margin-bottom:16px; }
.counts span { display:inline-block; margin-right:12px; }
table { border-collapse:collapse; width:100%; } td, th { text-align:left; padding:8px; border-bottom:1px solid var(--line); vertical-align:top; }
.verdict { font-weight:600; } .v-blocked { color:var(--p0); } .v-at-risk { color:var(--p1); } .v-not-covered { color:var(--muted); }
.screen-body { display:grid; grid-template-columns:minmax(220px,300px) 1fr; gap:20px; } @media (max-width:700px) { .screen-body { grid-template-columns:1fr; } }
.shot { margin:0; } .frame { position:relative; border-radius:16px; overflow:hidden; border:1px solid var(--line); } .frame img { display:block; width:100%; }
.box { position:absolute; border:2px solid; border-radius:4px; text-decoration:none; } .box span { position:absolute; top:-10px; left:-10px; min-width:20px; height:20px; border-radius:10px; font-size:12px; font-weight:700; color:#fff; display:grid; place-items:center; padding:0 4px; }
.sev-P0 { border-color:var(--p0); } .sev-P0 span, span.sev-P0 { background:var(--p0); }
.sev-P1 { border-color:var(--p1); } .sev-P1 span, span.sev-P1 { background:var(--p1); }
.sev-P2 { border-color:var(--p2); } .sev-P2 span, span.sev-P2 { background:var(--p2); }
.sev-P3 { border-color:var(--p3); } .sev-P3 span, span.sev-P3 { background:var(--p3); }
span.agree { font-size:11px; font-weight:700; color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:0 5px; margin-left:4px; }
span.new { font-size:11px; font-weight:700; text-transform:uppercase; color:var(--p1); border:1px solid var(--p1); border-radius:6px; padding:0 5px; margin-left:4px; }
span.sev { color:#fff; border-radius:6px; padding:1px 6px; font-size:12px; font-weight:700; }
.flist { padding-left:20px; margin:0; } .flist li { margin-bottom:10px; } .flist .none { list-style:none; color:var(--muted); }
details p { margin:6px 0; } summary { cursor:pointer; color:var(--muted); font-size:13px; }
.thumbs { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; } .thumbs figure { margin:0; width:110px; } .thumbs img { width:100%; border-radius:8px; border:1px solid var(--line); }
ul.plain { padding-left:20px; }
.iamap-wrap { overflow-x:auto; background:var(--card); border-radius:12px; padding:8px; }
svg.iamap .node rect { fill:var(--bg); stroke:var(--line); stroke-width:1.5; } svg.iamap .node.start rect { stroke:var(--fg); stroke-width:2.5; } svg.iamap .node.flagged rect { stroke:var(--p1); stroke-width:2.5; }
svg.iamap text { fill:var(--fg); font:600 13px system-ui,sans-serif; } svg.iamap text.sub { fill:var(--muted); font-weight:400; font-size:11px; }
svg.iamap .edge { fill:none; stroke:var(--muted); stroke-width:1.2; } svg.iamap .edge.back { stroke-dasharray:4 3; } svg.iamap marker path { fill:var(--muted); }
.jstrip { display:flex; gap:10px; overflow-x:auto; padding-bottom:6px; } .jstep { flex:0 0 150px; } .jstep img { width:100%; border-radius:10px; border:1px solid var(--line); display:block; }
.jstep .tap { font-size:12px; color:var(--muted); margin:4px 0 2px; } .jstep .v { font-size:12px; } .v-ok { color:var(--fg); } .v-friction { color:var(--p2); } .v-blocked, .broken { color:var(--p0); font-weight:700; }
table.matrix td, table.matrix th { text-align:center; } table.matrix td:first-child, table.matrix th:first-child { text-align:left; }
.gate { padding:10px 14px; border-radius:10px; border:1px solid var(--line); } .gate.fail { border-color:var(--p1); } .gate.pass { border-color:var(--line); }
</style></head><body><main>
<h1>Design critique: ${esc(framing.title)}</h1>
<p class="sub">${esc(merged.generatedAt.slice(0, 10))} · ${merged.coverage.screens} screens · ${merged.coverage.renders} renders · critics: ${esc(merged.coverage.critics.join(', ') || 'none yet (checks only)')}</p>
<p class="gate ${gate.pass ? 'pass' : 'fail'}"><strong>Gate: ${gate.pass ? 'passed' : 'not passed'}</strong> · fail on ${esc(gate.gate.fail_on)} · target score ${esc(gate.gate.target_score ?? 'none')}${gate.pass ? '' : `<br>${gate.reasons.map(esc).join('<br>')}`}</p>
<h2>The problem</h2>
<div class="frame-box">${framingText ? `${framing.problem ? `<p>${mdInline(framing.problem)}</p>` : ''}${framing.users ? `<p><strong>Users</strong><br>${mdInline(framing.users)}</p>` : ''}${framing.tasks ? `<p><strong>Key tasks</strong><br>${mdInline(framing.tasks)}</p>` : ''}${framing.assumptions.length ? `<p><strong>Open assumptions</strong></p><ul class="plain">${framing.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}` : '<p>No PRODUCT.md was provided, so task fit could not be judged. Run the frame skill first.</p>'}
${frameCheck ? `<p><strong>Fit to the problem: ${esc(frameCheck.fit)}.</strong> ${esc(frameCheck.summary || '')}</p>` : ''}</div>
${tasks.length ? `<h2>Key tasks</h2><table><tr><th>Task</th><th>Verdict</th><th>Score</th><th>Why</th><th>Critic</th></tr>${tasks.map((t) => `<tr><td>${t.id ? `${esc(t.id)} ` : ''}${esc(t.task)}</td><td class="verdict v-${esc(t.verdict)}">${esc(t.verdict)}</td><td>${typeof t.score === 'number' ? `${esc(t.score)}/10${t.coverage === 'partial' ? ' <span class="meta">(partial view, not gated)</span>' : ''}` : '–'}</td><td>${esc(t.summary || '')}</td><td class="meta">${esc(t.source)}</td></tr>`).join('')}</table>` : ''}
${comparison ? `<h2>Since last run</h2><div class="frame-box"><p>Compared with ${esc(path.basename(comparison.base))}: <strong>${comparison.fixed.length} fixed</strong>, <strong>${comparison.introduced.length} new</strong>, ${comparison.persisting.length} still open${comparison.notRechecked.length ? `, ${comparison.notRechecked.length} on screens not in this run` : ''}.</p>${comparison.fixed.length ? `<ul class="plain">${comparison.fixed.map((f) => `<li><s>${esc(f.title)}</s> <span class="meta">${esc(f.severity)} · ${esc(screenTitle(f.screen))}</span></li>`).join('')}</ul>` : ''}</div>` : ''}
<h2>Findings</h2>
<p class="counts">${SEV.map((s) => `<span><span class="sev sev-${s}">${s}</span> ${counts[s]}</span>`).join('')}</p>
${global.length ? `<div class="screen"><h3>Across screens</h3><ol class="flist">${global.map((f) => `${findingItem(f, `f${f.n}`)}`).join('')}</ol></div>` : ''}
${manifest.screens.map(screenCard).join('\n')}
${strengths.length ? `<h2>What works</h2><ul class="plain">${strengths.map((s) => `<li>${esc(s.text)}${s.basis?.length ? ` <span class="meta">${esc(s.basis.join(', '))}</span>` : ''}</li>`).join('')}</ul>` : ''}
${manifest.taste?.length ? `<h2>The direction you chose</h2><div class="frame-box"><div class="thumbs">${manifest.taste.map((t) => `<figure><a href="${esc(t)}"><img src="${esc(t)}" alt="reference"></a></figure>`).join('')}</div><p class="sub">The critics saw these as the intended direction. Closeness isn't scored, and it never excuses a usability problem.</p></div>` : ''}
${review ? reviewHtml() : ''}
${decided.length ? `<h2>Decided by you</h2><ul class="plain">${decided.map((f) => `<li>${f.decision.decision === 'dismiss' ? 'Dismissed' : `Re-rated ${esc(f.severity)} → ${esc(f.decision.severity)}`}: ${esc(f.title)} <span class="meta">${esc(screenTitle(f.screen))} · ${esc(f.rule)} · ${esc(f.source)}</span>${f.decision.reason ? `<br><span class="sub">${esc(f.decision.reason)}</span>` : ''}</li>`).join('')}</ul>` : ''}
${comparisons.length ? `<h2>Variant comparison</h2><ul class="plain">${comparisons.map((c) => `<li><strong>${esc(c.group)}</strong>: recommend ${esc(c.recommended)}. ${esc(c.reasons || '')}</li>`).join('')}</ul>` : ''}
<h2>To build this</h2>
<p class="sub">Platform: <strong>${esc(stack.platform)}</strong> · Stack: <strong>${esc(stack.decided ? stack.stacks.join(', ') : 'not decided')}</strong> · picks come only from catalog/stack.yaml (verified ${esc(stack.verified)}), each with its source.</p>
${stack.notes.map((n) => `<p class="sub"><em>${esc(n)}</em></p>`).join('')}
${stack.steps.map((st, i) => `<div class="screen"><h3>${i + 1}. ${esc(st.title)}</h3><ul class="plain">${st.picks.map((p) => `<li><strong>${esc(p.name)}</strong> <span class="meta">${esc(p.by)} · ${esc(p.trust)}${stack.decided || st.role === 'prototype' ? '' : ` · for ${esc(p.stacks.join(', '))}`}${p.group && st.picks.filter((x) => x.group === p.group).length > 1 ? ' · alternative' : ''}</span><br>${esc(p.why)}${p.because ? ` <em>${esc(p.because)}.</em>` : ''}<br><code>${esc(p.install)}</code> · ${p.sources.map((u) => `<a href="${esc(u)}">source</a>`).join(' ')}</li>`).join('')}</ul></div>`).join('')}
${stack.watch.length ? `<p class="sub">Watched, not recommended yet: ${stack.watch.map((w) => `${esc(w.name)}: ${esc(w.why_not_yet)}`).join(' ')}</p>` : ''}
${notes.length || warnings.length ? `<h2>Notes</h2><ul class="plain">${notes.map((n) => `<li>${esc(n.screen)}: ${esc(n.note)}</li>`).join('')}${warnings.map((w) => `<li>Warning: ${esc(w)}</li>`).join('')}</ul>` : ''}
<p class="sub">Principle IDs refer to the designcritique principles library. Severity follows Nielsen's frequency, impact and persistence, weighted by task criticality.</p>
</main></body></html>`;
fs.writeFileSync(path.join(runDir, 'report.html'), html);

console.log(`Gate: ${gate.pass ? 'passed' : `not passed (${gate.reasons.join('; ')})`}`);
console.log(`Report: ${findings.length} findings ${JSON.stringify(counts)} from ${['checks', ...merged.coverage.critics].join(', ')}`);
console.log(`Wrote ${path.join(runDir, 'report.md')}`);
console.log(`Wrote ${path.join(runDir, 'report.html')}`);
for (const w of warnings) console.error(`warning: ${w}`);
