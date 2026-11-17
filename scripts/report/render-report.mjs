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
import { DEFAULT_GATE } from '../lib/config.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: render-report.mjs --run <runDir>'); process.exit(2); }
const runDir = path.resolve(args.run);
const manifest = readJson(path.join(runDir, 'manifest.json'));
const checkFindings = [
  ...readJson(path.join(runDir, 'checks', 'findings.json'), []),
  ...readJson(path.join(runDir, 'checks', 'motion.json'), []),
];
const notes = [
  ...readJson(path.join(runDir, 'checks', 'notes.json'), []),
  ...readJson(path.join(runDir, 'motion', 'notes.json'), []).map((note) => ({ screen: 'motion', note })),
];
const warnings = [...(manifest.warnings || [])];

const SEV = ['P0', 'P1', 'P2', 'P3'];
const DECISIONS_REL = '.designcritique/decisions.yaml';
const CATEGORIES = new Set(['task-fit', 'ux', 'content', 'visual', 'layout', 'typography', 'color', 'a11y', 'platform', 'tokens']);
const screenIds = new Set(manifest.screens.map((s) => s.id));
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
const tasteChecks = [];
const overallScores = [];
for (const { file, data } of critics) {
  const v = validateCritique(data, { screens: screenIds });
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
  if (data.taste_check) tasteChecks.push({ ...data.taste_check, source });
  for (const t of data.tasks || []) tasks.push({ ...t, source, finding_ids: undefined, steps: (t.steps || []).map((s) => ({ ...s, finding_ids: (s.finding_ids || []).map((id) => `${source}-${id}`.replace(new RegExp(`^${source}-${source}-`), `${source}-`)) })) });
  for (const s of data.strengths || []) strengths.push({ ...s, source });
  for (const c of data.comparisons || []) comparisons.push({ ...c, source });
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
const { open, decided } = applyDecisions([...byKey.values()], decisions);
const findings = open.sort((a, b) =>
  SEV.indexOf(a.severity) - SEV.indexOf(b.severity)
  || (a.screen === '*' ? -1 : b.screen === '*' ? 1 : (screenOrder.get(a.screen) ?? 0) - (screenOrder.get(b.screen) ?? 0))
  || a.rule.localeCompare(b.rule));
findings.forEach((f, i) => { f.n = i + 1; });
const counts = Object.fromEntries(SEV.map((s) => [s, findings.filter((f) => f.severity === s).length]));

// ---------- framing ----------
const framingText = manifest.framingSnapshot ? fs.readFileSync(path.join(runDir, manifest.framingSnapshot), 'utf8') : '';
function section(md, name) {
  const m = md.match(new RegExp(`^##\\s+${name}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'mi'));
  return m ? m[1].trim() : '';
}
// An [assumption] line plus its wrapped continuation lines (up to the next blank line or list item).
function assumptionsOf(md) {
  const lines = md.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\[assumption\]/i.test(lines[i])) continue;
    let text = lines[i].replace(/^\s*[-*\d.]+\s*/, '').trim();
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*([-*]|\d+\.)\s/.test(lines[i + 1]) && !/^#/.test(lines[i + 1])) text += ' ' + lines[++i].trim();
    out.push(text);
  }
  return out;
}
const productTitle = (framingText.match(/^#\s+(.+)$/m) || [])[1] || 'Untitled product';
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

const gate = evaluateGate({ findings, tasks, critics: critics.map((c) => c.data.critic || c.file) }, manifest.gate || DEFAULT_GATE);

const merged = {
  generatedAt: new Date().toISOString(),
  run: runDir,
  framing: { ...framing, present: !!framingText, frameCheck },
  tasks, findings, strengths, comparisons, counts, stack,
  scores: { tasks: gate.scores, overall: overallScores },
  taste: { references: manifest.taste || [], checks: tasteChecks },
  gate: { pass: gate.pass, reasons: gate.reasons, ...gate.gate },
  decided: decided.map(({ id, screen, rule, severity, title, source, decision }) => ({ id, screen, rule, severity, title, source, decision: decision.decision, newSeverity: decision.severity, reason: decision.reason })),
  decisionsFile: decisions.length ? decisionsPath(manifest.baseDir) : null,
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
  for (const t of tasks) L.push(`| ${md(t.task)} | ${t.verdict} | ${typeof t.score === 'number' ? `${t.score}/10` : '–'} | ${md(t.summary || '')} | ${t.source} |`);
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
    L.push(`**${f.n}. ${md(f.title)}**${f.status === 'new' ? ' _(new)_' : ''}  `, `${screenTitle(f.screen)}${f.platform ? ` (${f.platform})` : ''} · ${f.basis.join(', ')} · ${f.source}${f.confidence !== 'high' ? ` · ${f.confidence} confidence` : ''}`, '');
    L.push(`- Evidence: ${md(f.evidence).replace(/\n/g, '; ')}`);
    if (f.impact) L.push(`- Impact: ${md(f.impact)}`);
    L.push(`- Fix: ${md(f.recommendation)}`, '');
  }
}
if (strengths.length) L.push('## What works', '', ...strengths.map((s) => `- ${md(s.text)}${s.screen && s.screen !== '*' ? ` (${screenTitle(s.screen)})` : ''}${s.basis?.length ? ` · ${s.basis.join(', ')}` : ''}`), '');
if (manifest.taste?.length) {
  L.push('## Against the direction you chose', '', `${manifest.taste.length} reference image(s) in taste/. Judged apart from the findings: being close to a reference doesn't excuse a usability problem.`, '');
  if (!tasteChecks.length) L.push('_No critic judged the screens against these references._', '');
  for (const t of tasteChecks) {
    L.push(`**${t.score}/10** (${t.source}): ${md(t.summary)}`, '');
    for (const g of t.gaps || []) L.push(`- ${screenTitle(g.screen)}${g.reference ? ` vs ${g.reference}` : ''}: ${md(g.text)}`);
    if (t.gaps?.length) L.push('');
  }
}
if (comparisons.length) {
  L.push('## Variant comparison', '');
  for (const c of comparisons) L.push(`- **${c.group}**: recommend ${c.recommended}${c.ranking ? ` (ranking: ${c.ranking.join(' > ')})` : ''}. ${md(c.reasons || '')}`);
  L.push('');
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

function md(s) { return String(s ?? '').replace(/\|/g, '\\|'); }

// ---------- report.html ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mdInline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

function screenCard(screen) {
  const main = screen.captures.find((c) => c.variant === 'light' && (c.device === 'standard' || c.device === 'frame')) || screen.captures[0];
  const others = screen.captures.filter((c) => c !== main && c.variant !== 'light');
  const own = findings.filter((f) => f.screen === screen.id);
  const vw = main.viewport?.width || 1;
  const vh = main.viewport?.height || 1;
  const markers = own.filter((f) => f.element?.box && f.element.box.y < vh && (!f.platform || f.platform === main.platform)).map((f) => {
    const b = f.element.box;
    const st = `left:${(b.x / vw) * 100}%;top:${(b.y / vh) * 100}%;width:${(Math.max(b.w, 8) / vw) * 100}%;height:${(Math.max(b.h, 8) / vh) * 100}%`;
    return `<a class="box sev-${f.severity}" style="${st}" href="#f${f.n}" title="${esc(f.title)}"><span>${f.n}</span></a>`;
  }).join('');
  return `<section class="screen" id="s-${esc(screen.id)}">
  <h3>${esc(screen.title)} <small>${esc(screen.id)} · ${esc(screen.platform)}${screen.flow ? ` · ${esc(screen.flow)} ${screen.step ?? ''}` : ''}</small></h3>
  <div class="screen-body">
    <figure class="shot"><div class="frame"><img src="${esc(main.screenshot)}" alt="${esc(screen.title)}, ${esc(main.variant)}">${markers}</div><figcaption>${esc(main.deviceName)} · ${esc(main.variant)}</figcaption></figure>
    <div class="side">
      <ol class="flist">${own.map((f) => `<li id="f${f.n}" value="${f.n}"><span class="sev sev-${f.severity}">${f.severity}</span> <strong>${esc(f.title)}</strong>${f.status === 'new' ? ' <span class="new">new</span>' : ''}<div class="meta">${esc(f.basis.join(', '))} · ${esc(f.source)}${f.platform ? ` · ${esc(f.platform)}` : ''}</div><details><summary>Evidence and fix</summary><p>${mdInline(f.evidence)}</p>${f.impact ? `<p><em>Impact:</em> ${mdInline(f.impact)}</p>` : ''}<p><em>Fix:</em> ${mdInline(f.recommendation)}</p></details></li>`).join('') || '<li class="none">No findings for this screen.</li>'}</ol>
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
span.new { font-size:11px; font-weight:700; text-transform:uppercase; color:var(--p1); border:1px solid var(--p1); border-radius:6px; padding:0 5px; margin-left:4px; }
span.sev { color:#fff; border-radius:6px; padding:1px 6px; font-size:12px; font-weight:700; }
.flist { padding-left:20px; margin:0; } .flist li { margin-bottom:10px; } .flist .none { list-style:none; color:var(--muted); }
details p { margin:6px 0; } summary { cursor:pointer; color:var(--muted); font-size:13px; }
.thumbs { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; } .thumbs figure { margin:0; width:110px; } .thumbs img { width:100%; border-radius:8px; border:1px solid var(--line); }
ul.plain { padding-left:20px; }
.gate { padding:10px 14px; border-radius:10px; border:1px solid var(--line); } .gate.fail { border-color:var(--p1); } .gate.pass { border-color:var(--line); }
</style></head><body><main>
<h1>Design critique: ${esc(framing.title)}</h1>
<p class="sub">${esc(merged.generatedAt.slice(0, 10))} · ${merged.coverage.screens} screens · ${merged.coverage.renders} renders · critics: ${esc(merged.coverage.critics.join(', ') || 'none yet (checks only)')}</p>
<p class="gate ${gate.pass ? 'pass' : 'fail'}"><strong>Gate: ${gate.pass ? 'passed' : 'not passed'}</strong> · fail on ${esc(gate.gate.fail_on)} · target score ${esc(gate.gate.target_score ?? 'none')}${gate.pass ? '' : `<br>${gate.reasons.map(esc).join('<br>')}`}</p>
<h2>The problem</h2>
<div class="frame-box">${framingText ? `${framing.problem ? `<p>${mdInline(framing.problem)}</p>` : ''}${framing.users ? `<p><strong>Users</strong><br>${mdInline(framing.users)}</p>` : ''}${framing.tasks ? `<p><strong>Key tasks</strong><br>${mdInline(framing.tasks)}</p>` : ''}${framing.assumptions.length ? `<p><strong>Open assumptions</strong></p><ul class="plain">${framing.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}` : '<p>No PRODUCT.md was provided, so task fit could not be judged. Run the frame skill first.</p>'}
${frameCheck ? `<p><strong>Fit to the problem: ${esc(frameCheck.fit)}.</strong> ${esc(frameCheck.summary || '')}</p>` : ''}</div>
${tasks.length ? `<h2>Key tasks</h2><table><tr><th>Task</th><th>Verdict</th><th>Score</th><th>Why</th><th>Critic</th></tr>${tasks.map((t) => `<tr><td>${esc(t.task)}</td><td class="verdict v-${esc(t.verdict)}">${esc(t.verdict)}</td><td>${typeof t.score === 'number' ? `${esc(t.score)}/10` : '–'}</td><td>${esc(t.summary || '')}</td><td class="meta">${esc(t.source)}</td></tr>`).join('')}</table>` : ''}
${comparison ? `<h2>Since last run</h2><div class="frame-box"><p>Compared with ${esc(path.basename(comparison.base))}: <strong>${comparison.fixed.length} fixed</strong>, <strong>${comparison.introduced.length} new</strong>, ${comparison.persisting.length} still open${comparison.notRechecked.length ? `, ${comparison.notRechecked.length} on screens not in this run` : ''}.</p>${comparison.fixed.length ? `<ul class="plain">${comparison.fixed.map((f) => `<li><s>${esc(f.title)}</s> <span class="meta">${esc(f.severity)} · ${esc(screenTitle(f.screen))}</span></li>`).join('')}</ul>` : ''}</div>` : ''}
<h2>Findings</h2>
<p class="counts">${SEV.map((s) => `<span><span class="sev sev-${s}">${s}</span> ${counts[s]}</span>`).join('')}</p>
${global.length ? `<div class="screen"><h3>Across all screens</h3><ol class="flist">${global.map((f) => `<li id="f${f.n}" value="${f.n}"><span class="sev sev-${f.severity}">${f.severity}</span> <strong>${esc(f.title)}</strong><div class="meta">${esc(f.basis.join(', '))} · ${esc(f.source)}</div><details><summary>Evidence and fix</summary><p>${mdInline(f.evidence)}</p>${f.impact ? `<p><em>Impact:</em> ${mdInline(f.impact)}</p>` : ''}<p><em>Fix:</em> ${mdInline(f.recommendation)}</p></details></li>`).join('')}</ol></div>` : ''}
${manifest.screens.map(screenCard).join('\n')}
${strengths.length ? `<h2>What works</h2><ul class="plain">${strengths.map((s) => `<li>${esc(s.text)}${s.basis?.length ? ` <span class="meta">${esc(s.basis.join(', '))}</span>` : ''}</li>`).join('')}</ul>` : ''}
${manifest.taste?.length ? `<h2>Against the direction you chose</h2><div class="frame-box"><div class="thumbs">${manifest.taste.map((t) => `<figure><a href="${esc(t)}"><img src="${esc(t)}" alt="reference"></a></figure>`).join('')}</div>${tasteChecks.map((t) => `<p><strong>${esc(t.score)}/10</strong> <span class="meta">${esc(t.source)}</span> ${esc(t.summary)}</p>${t.gaps?.length ? `<ul class="plain">${t.gaps.map((g) => `<li>${esc(screenTitle(g.screen))}${g.reference ? ` vs ${esc(g.reference)}` : ''}: ${esc(g.text)}</li>`).join('')}</ul>` : ''}`).join('') || '<p class="sub">No critic judged the screens against these references.</p>'}</div>` : ''}
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
