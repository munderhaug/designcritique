#!/usr/bin/env node
// Merge check, critic and Impeccable findings for a run; write findings.json, report.md, report.html.
//
// Usage: node scripts/report/render-report.mjs --run <runDir>
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, writeJson } from '../lib/config.mjs';
import { recommendStack, stackMarkdown } from '../lib/stack.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: render-report.mjs --run <runDir>'); process.exit(2); }
const runDir = path.resolve(args.run);
const manifest = readJson(path.join(runDir, 'manifest.json'));
const checkFindings = readJson(path.join(runDir, 'checks', 'findings.json'), []);
const notes = readJson(path.join(runDir, 'checks', 'notes.json'), []);
const warnings = [...(manifest.warnings || [])];

const SEV = ['P0', 'P1', 'P2', 'P3'];
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

function validCriticFinding(f, file) {
  const problems = [];
  for (const k of ['id', 'screen', 'rule', 'severity', 'title', 'evidence', 'recommendation']) if (!f[k]) problems.push(`missing ${k}`);
  if (f.severity && !SEV.includes(f.severity)) problems.push(`bad severity ${f.severity}`);
  if (f.screen && f.screen !== '*' && !screenIds.has(f.screen)) problems.push(`unknown screen ${f.screen}`);
  if (problems.length) warnings.push(`critique/${file}: finding ${f.id || '?'} dropped (${problems.join(', ')})`);
  return !problems.length;
}

const all = checkFindings.map((f) => ({ ...f }));
let frameCheck = null;
const tasks = [];
const strengths = [];
const comparisons = [];
for (const { file, data } of critics) {
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
  for (const t of data.tasks || []) tasks.push({ ...t, finding_ids: undefined, steps: (t.steps || []).map((s) => ({ ...s, finding_ids: (s.finding_ids || []).map((id) => `${source}-${id}`.replace(new RegExp(`^${source}-${source}-`), `${source}-`)) })) });
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
const findings = [...byKey.values()].sort((a, b) =>
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

const stack = recommendStack({ productText: framingText, fallbackPlatform: manifest.screens[0]?.platform, findings: [...byKey.values()] });

const merged = {
  generatedAt: new Date().toISOString(),
  run: runDir,
  framing: { ...framing, present: !!framingText, frameCheck },
  tasks, findings, strengths, comparisons, counts, stack,
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
  L.push('## Key tasks', '', '| Task | Verdict | Why |', '|---|---|---|');
  for (const t of tasks) L.push(`| ${md(t.task)} | ${t.verdict} | ${md(t.summary || '')} |`);
  L.push('');
}
L.push('## Findings', '', SEV.map((s) => `${s}: ${counts[s]}`).join(' · '), '');
for (const sev of SEV) {
  const list = findings.filter((f) => f.severity === sev);
  if (!list.length) continue;
  L.push(`### ${sev}`, '');
  for (const f of list) {
    L.push(`**${f.n}. ${md(f.title)}**  `, `${screenTitle(f.screen)}${f.platform ? ` (${f.platform})` : ''} · ${f.basis.join(', ')} · ${f.source}${f.confidence !== 'high' ? ` · ${f.confidence} confidence` : ''}`, '');
    L.push(`- Evidence: ${md(f.evidence).replace(/\n/g, '; ')}`);
    if (f.impact) L.push(`- Impact: ${md(f.impact)}`);
    L.push(`- Fix: ${md(f.recommendation)}`, '');
  }
}
if (strengths.length) L.push('## What works', '', ...strengths.map((s) => `- ${md(s.text)}${s.screen && s.screen !== '*' ? ` (${screenTitle(s.screen)})` : ''}${s.basis?.length ? ` · ${s.basis.join(', ')}` : ''}`), '');
if (comparisons.length) {
  L.push('## Variant comparison', '');
  for (const c of comparisons) L.push(`- **${c.group}**: recommend ${c.recommended}${c.ranking ? ` (ranking: ${c.ranking.join(' > ')})` : ''}. ${md(c.reasons || '')}`);
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
      <ol class="flist">${own.map((f) => `<li id="f${f.n}" value="${f.n}"><span class="sev sev-${f.severity}">${f.severity}</span> <strong>${esc(f.title)}</strong><div class="meta">${esc(f.basis.join(', '))} · ${esc(f.source)}${f.platform ? ` · ${esc(f.platform)}` : ''}</div><details><summary>Evidence and fix</summary><p>${mdInline(f.evidence)}</p>${f.impact ? `<p><em>Impact:</em> ${mdInline(f.impact)}</p>` : ''}<p><em>Fix:</em> ${mdInline(f.recommendation)}</p></details></li>`).join('') || '<li class="none">No findings for this screen.</li>'}</ol>
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
span.sev { color:#fff; border-radius:6px; padding:1px 6px; font-size:12px; font-weight:700; }
.flist { padding-left:20px; margin:0; } .flist li { margin-bottom:10px; } .flist .none { list-style:none; color:var(--muted); }
details p { margin:6px 0; } summary { cursor:pointer; color:var(--muted); font-size:13px; }
.thumbs { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; } .thumbs figure { margin:0; width:110px; } .thumbs img { width:100%; border-radius:8px; border:1px solid var(--line); }
ul.plain { padding-left:20px; }
</style></head><body><main>
<h1>Design critique: ${esc(framing.title)}</h1>
<p class="sub">${esc(merged.generatedAt.slice(0, 10))} · ${merged.coverage.screens} screens · ${merged.coverage.renders} renders · critics: ${esc(merged.coverage.critics.join(', ') || 'none yet (checks only)')}</p>
<h2>The problem</h2>
<div class="frame-box">${framingText ? `${framing.problem ? `<p>${mdInline(framing.problem)}</p>` : ''}${framing.users ? `<p><strong>Users</strong><br>${mdInline(framing.users)}</p>` : ''}${framing.tasks ? `<p><strong>Key tasks</strong><br>${mdInline(framing.tasks)}</p>` : ''}${framing.assumptions.length ? `<p><strong>Open assumptions</strong></p><ul class="plain">${framing.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}` : '<p>No PRODUCT.md was provided, so task fit could not be judged. Run the frame skill first.</p>'}
${frameCheck ? `<p><strong>Fit to the problem: ${esc(frameCheck.fit)}.</strong> ${esc(frameCheck.summary || '')}</p>` : ''}</div>
${tasks.length ? `<h2>Key tasks</h2><table><tr><th>Task</th><th>Verdict</th><th>Why</th></tr>${tasks.map((t) => `<tr><td>${esc(t.task)}</td><td class="verdict v-${esc(t.verdict)}">${esc(t.verdict)}</td><td>${esc(t.summary || '')}</td></tr>`).join('')}</table>` : ''}
<h2>Findings</h2>
<p class="counts">${SEV.map((s) => `<span><span class="sev sev-${s}">${s}</span> ${counts[s]}</span>`).join('')}</p>
${global.length ? `<div class="screen"><h3>Across all screens</h3><ol class="flist">${global.map((f) => `<li id="f${f.n}" value="${f.n}"><span class="sev sev-${f.severity}">${f.severity}</span> <strong>${esc(f.title)}</strong><div class="meta">${esc(f.basis.join(', '))} · ${esc(f.source)}</div><details><summary>Evidence and fix</summary><p>${mdInline(f.evidence)}</p>${f.impact ? `<p><em>Impact:</em> ${mdInline(f.impact)}</p>` : ''}<p><em>Fix:</em> ${mdInline(f.recommendation)}</p></details></li>`).join('')}</ol></div>` : ''}
${manifest.screens.map(screenCard).join('\n')}
${strengths.length ? `<h2>What works</h2><ul class="plain">${strengths.map((s) => `<li>${esc(s.text)}${s.basis?.length ? ` <span class="meta">${esc(s.basis.join(', '))}</span>` : ''}</li>`).join('')}</ul>` : ''}
${comparisons.length ? `<h2>Variant comparison</h2><ul class="plain">${comparisons.map((c) => `<li><strong>${esc(c.group)}</strong>: recommend ${esc(c.recommended)}. ${esc(c.reasons || '')}</li>`).join('')}</ul>` : ''}
<h2>To build this</h2>
<p class="sub">Platform: <strong>${esc(stack.platform)}</strong> · Stack: <strong>${esc(stack.decided ? stack.stacks.join(', ') : 'not decided')}</strong> · picks come only from catalog/stack.yaml (verified ${esc(stack.verified)}), each with its source.</p>
${stack.notes.map((n) => `<p class="sub"><em>${esc(n)}</em></p>`).join('')}
${stack.steps.map((st, i) => `<div class="screen"><h3>${i + 1}. ${esc(st.title)}</h3><ul class="plain">${st.picks.map((p) => `<li><strong>${esc(p.name)}</strong> <span class="meta">${esc(p.by)} · ${esc(p.trust)}${stack.decided ? '' : ` · for ${esc(p.stacks.join(', '))}`}${p.group && st.picks.filter((x) => x.group === p.group).length > 1 ? ' · alternative' : ''}</span><br>${esc(p.why)}${p.because ? ` <em>${esc(p.because)}.</em>` : ''}<br><code>${esc(p.install)}</code> · ${p.sources.map((u) => `<a href="${esc(u)}">source</a>`).join(' ')}</li>`).join('')}</ul></div>`).join('')}
${notes.length || warnings.length ? `<h2>Notes</h2><ul class="plain">${notes.map((n) => `<li>${esc(n.screen)}: ${esc(n.note)}</li>`).join('')}${warnings.map((w) => `<li>Warning: ${esc(w)}</li>`).join('')}</ul>` : ''}
<p class="sub">Principle IDs refer to the designcritique principles library. Severity follows Nielsen's frequency, impact and persistence, weighted by task criticality.</p>
</main></body></html>`;
fs.writeFileSync(path.join(runDir, 'report.html'), html);

console.log(`Report: ${findings.length} findings ${JSON.stringify(counts)} from ${['checks', ...merged.coverage.critics].join(', ')}`);
console.log(`Wrote ${path.join(runDir, 'report.md')}`);
console.log(`Wrote ${path.join(runDir, 'report.html')}`);
for (const w of warnings) console.error(`warning: ${w}`);
