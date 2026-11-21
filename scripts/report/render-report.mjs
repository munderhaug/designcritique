#!/usr/bin/env node
// Merge check, critic and Impeccable findings for a run; write findings.json, report.md, report.html.
//
// Usage: node scripts/report/render-report.mjs --run <runDir> [--inline-thumbs [--thumb-width 240]]
//
// --inline-thumbs puts every screenshot into report.html as a small WebP, so the one file can be
// sent and opened on a phone without the run folder.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, writeJson } from '../lib/config.mjs';
import { recommendStack, stackMarkdown } from '../lib/stack.mjs';
import { validateCritique, repairPrincipleIds } from '../lib/validate.mjs';
import { findPreviousRun, compareFindings } from '../lib/compare.mjs';
import { loadDecisions, applyDecisions, decisionsPath } from '../lib/decisions.mjs';
import { evaluateGate } from '../lib/gate.mjs';
import { section, assumptionsOf, productName, unfilledSections, unfilledMessage } from '../lib/framing.mjs';
import { mergeAcrossSources, groupChecksByCause, isDeterministic } from '../lib/merge.mjs';
import { productModel, parseKeyTasks } from '../lib/product.mjs';
import { iaMapSvg, iaMapMermaid, rankProposals } from '../lib/review-report.mjs';
import { DEFAULT_GATE, normalizeGate, CHECK_FILES } from '../lib/config.mjs';
import { SEV, capList } from '../lib/report-shared.mjs';
import { renderMarkdown } from '../lib/report-md.mjs';
import { renderHtml } from '../lib/report-html.mjs';

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
const dropped = []; // critic findings that failed validation: reported, and severe ones fail the gate
function validCriticFinding(f, file) {
  const bad = criticValidity.get(file);
  if (bad && bad.has(f.id ?? '')) {
    warnings.push(`critique/${file}: finding ${f.id || '?'} (${f.severity || 'no severity'}: ${String(f.title || '').slice(0, 80)}) dropped: it fails validation`);
    dropped.push({ file, id: f.id, severity: f.severity });
    return false;
  }
  return true;
}

const all = checkFindings.map((f) => ({ ...f }));
let frameCheck = null;
const frameChecks = []; // every critic's judgement of fit, with the assumptions it rested on
const challenges = []; // questions and objections for the designer; never gated
const notExamined = [];
const tasks = [];
const strengths = [];
const comparisons = [];
const journeysJudged = [];
const moves = [];
const scopeVerdicts = [];
const overallScores = [];
for (const { file, data } of critics) {
  // A mistyped principle ID with one clear match is corrected, so the finding isn't lost.
  for (const r of repairPrincipleIds(data)) warnings.push(`critique/${file}: ${r.finding ? `finding ${r.finding}: ` : ''}"${r.from}" read as ${r.to}`);
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
  if (data.frame_check) frameChecks.push({ ...data.frame_check, source });
  for (const c of data.challenges || []) if (c?.claim && c?.question) challenges.push({ ...c, source });
  for (const x of data.not_examined || []) notExamined.push({ text: x, source });
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
const firstSection = (...names) => names.map((n) => section(framingText, n)).find(Boolean) || '';
const framing = {
  title: productName(framingText) || 'Untitled product',
  problem: firstSection('Problem', 'Product Purpose'),
  users: firstSection('Users'),
  context: firstSection('Context of use', 'Operating Context'),
  purpose: firstSection('Product Purpose'),
  success: firstSection('Success Criteria'),
  tasks: firstSection('Key tasks'),
  assumptions: assumptionsOf(framingText),
};
const unfilled = framingText ? unfilledSections(framingText) : [];

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

// ---------- holes in the evidence: a run that lost or never produced part of it hasn't passed ----------
const gateCfg = normalizeGate(manifest.gate || DEFAULT_GATE);
const incomplete = [];
const checkStatus = readJson(path.join(runDir, 'checks', 'status.json'), null);
const htmlScreens = manifest.screens.filter((sc) => sc.kind === 'html').length;
if (checkStatus?.failed?.length) incomplete.push(`check step(s) failed and found nothing: ${checkStatus.failed.join(', ')} (run run-all.mjs again and read its output)`);
else if (htmlScreens && !fs.existsSync(path.join(runDir, 'checks', 'findings.json'))) incomplete.push('the screen checks have not run on this capture (node scripts/checks/run-all.mjs --run <run>)');
if (manifest.complete === false) incomplete.push('the capture did not finish (run capture again with --resume)');
const failedCaptures = (manifest.warnings || []).filter((w) => /: capture failed: /.test(w));
if (failedCaptures.length) incomplete.push(`${failedCaptures.length} screen(s) failed to capture and were not judged: ${capList(failedCaptures.map((w) => w.split(':')[0]), 6)}`);
const limit = SEV.indexOf(gateCfg.fail_on);
const lost = dropped.filter((d) => limit >= 0 && (!SEV.includes(d.severity) || SEV.indexOf(d.severity) <= limit));
if (lost.length) incomplete.push(`${lost.length} critic finding(s) at ${gateCfg.fail_on} or worse were dropped as invalid (${[...new Set(lost.map((d) => `critique/${d.file}`))].join(', ')}): fix the file, see Notes`);
const tasksText = manifest.framingSnapshot && fs.existsSync(path.join(runDir, manifest.framingSnapshot)) ? section(fs.readFileSync(path.join(runDir, manifest.framingSnapshot), 'utf8'), 'Key Tasks') : '';
if (gateCfg.target_score != null && tasksText && !keyTasks.length && !unfilledSections(`## Key Tasks\n${tasksText}\n## Users\nx\n## Problem\nx`).length) {
  incomplete.push('no key task could be read from PRODUCT.md: write ## Key Tasks as a numbered list (1. **Name** (must not fail): …)');
}
for (const r of incomplete) warnings.push(r);

// ---------- the cold reading, and your answers to earlier challenges ----------
const coldReading = readJson(path.join(runDir, 'blind', 'reading.json'), null);
challenges.forEach((c, i) => { c.n = `C${i + 1}`; });
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
for (const c of challenges) {
  const d = decisions.find((x) => x.kind === 'challenge' && same(x.claim, c.claim));
  if (d) c.answer = { text: d.answer, date: d.date, by: d.by || null };
}

const gate = evaluateGate({ findings, tasks, critics: critics.map((c) => c.data.critic || c.file), journeys: journeysJudged, coverage: coverageData, criticalJourneys, keyTasks, incomplete }, gateCfg);

const merged = {
  keyTasks,
  generatedAt: new Date().toISOString(),
  run: runDir,
  framing: { ...framing, present: !!framingText, frameCheck, frameChecks },
  basis: 'Inspection by model reviewers and deterministic checks. Nothing here was tested with users.',
  coldReading, challenges, notExamined, incomplete,
  tasks, findings, strengths, comparisons, counts, stack,
  scores: { tasks: gate.scores, overall: overallScores },
  taste: { references: manifest.taste || [] },
  gate: { pass: gate.pass, off: gate.off, reasons: gate.reasons, ...gate.gate },
  decided: decided.map(({ id, screen, screens, rule, severity, title, source, evidence, recommendation, decision }) => ({ id, screen, screens, rule, severity, title, source, evidence, recommendation, decision: decision.decision, newSeverity: decision.severity, reason: decision.reason, discussion: decision.discussion })),
  agreed: findings.filter((f) => f.decision && ['accept', 'discussed'].includes(f.decision.decision)).map((f) => ({ id: f.id, n: f.n, title: f.title, decision: f.decision.decision, reason: f.decision.reason })),
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

// ---------- the two formats, from the same data ----------
const ctx = { CATEGORIES, DECISIONS_REL, all, args, baseDir, byKey, captureOf, challenges, checkFindings, checkStatus, coldReading, comparison, comparisons, consistencyInv, counts, coverageData, criticValidity, criticalIds, criticalJourneys, critics, critiqueDir, decided, decisions, dropped, failedCaptures, findings, firstSection, flagged, frameCheck, frameChecks, framing, framingText, gate, gateCfg, graph, htmlScreens, incomplete, journeysJudged, journeysRun, keyTasks, limit, lost, manifest, merged, moves, notExamined, notes, onePerProblem, open, overallScores, pageTitle, productM, proposals, review, runDir, same, scopeVerdicts, screenIds, screenOrder, stack, strengths, tasks, tasksText, unfilled, warnings };
fs.writeFileSync(path.join(runDir, 'report.md'), renderMarkdown(ctx));
const { html, inlined } = await renderHtml(ctx);
fs.writeFileSync(path.join(runDir, 'report.html'), html);
const htmlMb = Buffer.byteLength(html) / 1e6;

console.log(`Gate: ${gate.off ? 'off' : gate.pass ? 'passed' : `not passed (${gate.reasons.join('; ')})`}`);
console.log(`Report: ${findings.length} findings ${JSON.stringify(counts)} from ${['checks', ...merged.coverage.critics].join(', ')}`);
console.log(`Wrote ${path.join(runDir, 'report.md')}`);
console.log(`Wrote ${path.join(runDir, 'report.html')} (${htmlMb.toFixed(1)} MB${inlined ? `, ${inlined} screenshots inlined` : manifest.screens.length ? '; screenshots are linked from the run folder: add --inline-thumbs for one file to send' : ''})`);
for (const w of warnings) console.error(`warning: ${w}`);
