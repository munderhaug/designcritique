// report.html: the run as one page, with screenshots linked from the run folder or inlined as
// small WebP. The data comes ready from scripts/report/render-report.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { iaMapSvg } from './review-report.mjs';
import { unfilledMessage } from './framing.mjs';
import { SEV, STANCES, esc, mdInline, capLines, capList, subscoresOf, criticsOf, pastTense, reportHelpers } from './report-shared.mjs';

export async function renderHtml(ctx) {
  const { CATEGORIES, DECISIONS_REL, all, args, baseDir, byKey, captureOf, challenges, checkFindings, checkStatus, coldReading, comparison, comparisons, consistencyInv, counts, coverageData, criticValidity, criticalIds, criticalJourneys, critics, critiqueDir, decided, decisions, dropped, failedCaptures, findings, firstSection, flagged, frameCheck, frameChecks, framing, framingText, gate, gateCfg, graph, htmlScreens, incomplete, journeysJudged, journeysRun, keyTasks, limit, lost, manifest, merged, moves, notExamined, notes, onePerProblem, open, overallScores, pageTitle, productM, proposals, review, runDir, same, scopeVerdicts, screenIds, screenOrder, stack, strengths, tasks, tasksText, unfilled, warnings } = ctx;
  const { screenTitle, sparring } = reportHelpers(ctx);
  function reviewHtml() {
    const out = [];
    if (coverageData) {
      const kinds = ['ideal', 'empty', 'error', 'loading', 'partial', 'offline', 'first-run'];
      const unseen = coverageData.features.filter((f) => !f.seen);
      out.push(`<h2>Coverage</h2><div class="frame-box">${coverageData.features.length ? `<p>Features captured: <strong>${coverageData.features.length - unseen.length} of ${coverageData.features.length}</strong>${unseen.length ? `. Not seen in the capture (not covered, not necessarily missing): ${unseen.map((f) => esc(f.feature)).join(', ')}` : ''}.</p>` : ''}${coverageData.journeys.length ? `<p>Journeys: ${coverageData.journeys.map((j) => `${esc(j.id)} ${!j.scripted ? '(not scripted)' : j.completed ? '(completed)' : `<span class="broken">(broke at step ${j.brokenAt})</span>`}`).join(', ')}.</p>` : ''}${coverageData.neverSeenStates.length ? `<p>States never captured: ${coverageData.neverSeenStates.map(esc).join(', ')}.</p>` : ''}${coverageData.notCovered?.length ? `<p>Not covered by the crawl (tooling, not the prototype; left out of the dead-end and way-back checks and the gate): ${coverageData.notCovered.length} state(s). <span class="meta">${esc(capList(coverageData.notCovered.map((u) => `${u.title} (${u.state}): ${u.reason}`), 8))}</span></p>` : ''}
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
        steps.push(`<div class="jstep"><div class="tap">${k ? `${k}. tap “${esc(j.steps[k - 1])}”` : 'start'}</div>${cap ? `<img src="${img(cap.screenshot)}" alt="${esc(pageTitle(sid))}">` : j.brokenAt === k ? `<div class="broken">Broken: ${esc(j.error || '')}</div>` : ''}${verdicts}</div>`);
        if (!sid) break;
      }
      out.push(`<h3>${esc(j.title)}${criticalIds.has(j.id) ? ' <small>must not fail</small>' : ''}</h3><p class="sub">${judged.map((x) => `${esc(x.source)}: <strong>${esc(x.verdict)}</strong>${typeof x.score === 'number' ? ` ${x.score}/10` : ''}${x.summary ? ` – ${esc(x.summary)}` : ''}`).join('<br>') || 'Not judged by a critic yet.'}</p><div class="jstrip">${steps.join('')}</div>`);
    }
    if (journeysRun.length) out.splice(out.length - journeysRun.length, 0, '<h2>Journeys</h2>');
    if (productM.features.length) out.push(`<h2>Features and the problem</h2><table><tr><th>Feature</th><th>Problem part</th><th>Key task</th><th>Phase</th><th>Captured</th><th>Taps</th><th>Scope</th></tr>${productM.features.map((f) => { const c = coverageData?.features.find((x) => x.feature === f.feature); return `<tr><td>${esc(f.feature)}</td><td>${esc(f.problem)}</td><td>${esc(f.task)}</td><td>${esc(f.phase || '')}</td><td>${c ? (c.seen ? 'yes' : 'no') : ''}</td><td>${c?.depth ?? ''}</td><td>${scopeVerdicts.filter((x) => (x.feature || '').toLowerCase() === f.feature.toLowerCase()).map((x) => `${esc(x.verdict)} <span class="meta">${esc(x.source)}</span>`).join(', ')}</td></tr>`; }).join('')}</table>`);
    if (proposals.length) out.push(`<h2>Cut, add or move</h2><p class="sub">Proposals, ranked by impact. None is applied automatically: decide with <code>/designcritique:decide &lt;id&gt; accept|reject|defer</code>.</p><ol class="plain">${proposals.map((p) => `<li><strong>${esc(p.id)}</strong> ${p.type === 'move' ? `Move <strong>${esc(p.item)}</strong>${p.from ? ` from ${esc(p.from)}` : ''} to <strong>${esc(p.to)}</strong>` : `${esc(p.verdict[0].toUpperCase() + p.verdict.slice(1))} <strong>${esc(p.item)}</strong>`}: ${esc(p.reason)} <span class="meta">${esc(p.impact)} impact · ${esc(p.sources.join(' + '))}</span>${p.decision ? ` <span class="agree">${esc(pastTense(p.decision.decision))} by you</span>` : ''}</li>`).join('')}</ol>`);
    if (consistencyInv) {
      const multi = consistencyInv.icons.filter((i) => i.meanings.length > 1);
      out.push(`<h2>Consistency inventory</h2><div class="frame-box">${consistencyInv.components.length ? `<p><strong>Emphasised buttons</strong><br>${consistencyInv.components.map((c) => `${esc(c.signature)} ×${c.count} <span class="meta">${esc(c.examples.join(', '))}</span>`).join('<br>')}</p>` : ''}<p><strong>Icons</strong>: ${consistencyInv.icons.length} in use${multi.length ? `; more than one meaning: ${multi.map((i) => esc(i.meanings.join(' / '))).join('; ')}` : ''}.</p>${consistencyInv.terms.length ? `<p><strong>Terms</strong>: ${consistencyInv.terms.map((t) => `“${esc(t.avoid)}” → “${esc(t.use)}”`).join(', ')}</p>` : ''}${consistencyInv.formats.length ? `<p><strong>Amount formats</strong>: ${consistencyInv.formats.map((f) => `${esc(f.format)} (${esc(f.examples.join(', '))})`).join('; ')}</p>` : ''}${consistencyInv.figures.length ? `<p><strong>Figures that disagree</strong>: ${consistencyInv.figures.map((f) => `${esc(f.label)}: ${esc(f.values.map((v) => v.value).join(' vs '))}`).join('; ')}</p>` : ''}</div>`);
    }
    return out.join('\n');
  }

  function findingItem(f, anchor) {
    const badge = f.agreement === 'critics-agree' ? ` <span class="agree">${criticsOf(f).length} critics</span>` : f.agreement === 'check-and-critic' ? ' <span class="agree">check + critic</span>' : f.agreement === 'rendered-and-source' ? ' <span class="agree">rendered + source</span>' : '';
    const where = f.screens ? `<div class="meta">On ${f.screens.length} screens: ${esc(capList(f.screens.map(screenTitle)))}</div>` : '';
    const also = (f.also || []).map((a) => `<p><em>Also raised by ${esc(a.source)} (${esc(a.severity)}):</em> ${esc(a.title)}${a.evidence ? `. ${mdInline(capLines(a.evidence))}` : ''}${a.recommendation ? ` <em>Its fix:</em> ${esc(a.recommendation)}` : ''}</p>`).join('');
    return `<li${anchor ? ` id="${anchor}"` : ''} value="${f.n}"><span class="sev sev-${f.severity}">${f.severity}</span> <strong>${esc(f.title)}</strong>${f.status === 'new' ? ' <span class="new">new</span>' : ''}${badge}<div class="meta">${esc(f.basis.join(', '))} · ${esc((f.raisedBy || [f.source]).join(' + '))}${f.platform && !f.screens ? ` · ${esc(f.platform)}` : ''}</div>${where}<details><summary>Evidence and fix</summary><p>${mdInline(capLines(f.evidence))}</p>${f.impact ? `<p><em>Impact:</em> ${mdInline(f.impact)}</p>` : ''}<p><em>Fix:</em> ${mdInline(f.recommendation)}</p>${f.alternatives?.length ? `<p><em>Other ways:</em> ${f.alternatives.map(esc).join('; ')}</p>` : ''}${also}${(f.decision?.discussion || []).map((x) => `<p><em>${x.stance ? `${esc(x.by)} (${esc(STANCES[x.stance] || x.stance)})` : `You`}:</em> ${esc(x.text)}</p>`).join('')}</details></li>`;
  }

  // A finding on many screens is written out once (Across screens); each screen links to it.
  function findingLink(f) {
    return `<li value="${f.n}"><span class="sev sev-${f.severity}">${f.severity}</span> <a href="#f${f.n}">${esc(f.title)}</a> <span class="meta">on ${f.screens.length} screens</span></li>`;
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
      <figure class="shot"><div class="frame"><img src="${img(main.screenshot)}" alt="${esc(screen.title)}, ${esc(main.variant)}">${markers}</div><figcaption>${esc(main.deviceName)} · ${esc(main.variant)}</figcaption></figure>
      <div class="side">
        <ol class="flist">${own.map((f) => (f.screens ? findingLink(f) : findingItem(f, `f${f.n}`))).join('') || '<li class="none">No findings for this screen.</li>'}</ol>
        ${others.length ? `<div class="thumbs">${others.map((c) => `<figure>${link(c.screenshot, `<img src="${img(c.screenshot)}" alt`)}="${esc(c.variant)}"></a><figcaption>${esc(c.platform)} ${esc(c.device)} · ${esc(c.variant)}</figcaption></figure>`).join('')}</div>` : ''}
      </div>
    </div>
  </section>`;
  }

  // ---------- screenshots: linked from the run folder, or inlined as small WebP ----------
  const inline = new Map();
  if (args['inline-thumbs']) {
    const width = Number(args['thumb-width'] || 240);
    const files = new Set();
    for (const sc of manifest.screens) for (const c of sc.captures) files.add(c.screenshot);
    for (const t of manifest.taste || []) files.add(t);
    const { launch } = await import('./browser.mjs');
    const browser = await launch();
    try {
      const page = await browser.newPage();
      for (const rel of files) {
        const file = path.join(runDir, rel);
        if (!fs.existsSync(file)) continue;
        const type = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp', '.gif': 'gif' }[path.extname(file).toLowerCase()] || 'png';
        const src = `data:image/${type};base64,${fs.readFileSync(file).toString('base64')}`;
        const small = await page.evaluate(async ({ src, width }) => {
          const im = new Image();
          im.src = src;
          await im.decode();
          const scale = Math.min(1, width / im.naturalWidth);
          const c = document.createElement('canvas');
          c.width = Math.round(im.naturalWidth * scale); c.height = Math.round(im.naturalHeight * scale);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          return c.toDataURL('image/webp', 0.8);
        }, { src, width }).catch(() => null);
        if (small) inline.set(rel, small);
      }
    } finally { await browser.close(); }
  }
  function img(rel) { return inline.get(rel) || esc(rel); }
  // Inlined images have no file next to the report to open in full.
  function link(rel, inner) { return inline.has(rel) ? inner : `<a href="${esc(rel)}">${inner}</a>`; }

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
  <p class="gate ${gate.pass ? 'pass' : 'fail'}">${gate.off ? `<strong>Gate: off</strong>${gate.reasons.length ? `<br><span class="sub">Would have counted:</span><br>${gate.reasons.map(esc).join('<br>')}` : ''}` : `<strong>Gate: ${gate.pass ? 'passed' : 'not passed'}</strong> · fail on ${esc(gate.gate.fail_on)} · target score ${esc(gate.gate.target_score ?? 'none')}${gate.pass ? '' : `<br>${gate.reasons.map(esc).join('<br>')}`}`}</p>
  <p class="sub">${esc(merged.basis)}</p>
  <h2>The problem</h2>
  <div class="frame-box">${framingText ? `${unfilled.length ? `<p><strong>${esc(unfilledMessage(unfilled))}</strong></p>` : ''}${framing.problem ? `<p>${mdInline(framing.problem)}</p>` : ''}${framing.users ? `<p><strong>Users</strong><br>${mdInline(framing.users)}</p>` : ''}${framing.tasks ? `<p><strong>Key tasks</strong><br>${mdInline(framing.tasks)}</p>` : ''}${framing.assumptions.length ? `<p><strong>Open assumptions</strong></p><ul class="plain">${framing.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}` : '<p>No PRODUCT.md was provided, so task fit could not be judged. Run the frame skill first.</p>'}
  ${framing.context ? `<p><strong>Context of use</strong><br>${mdInline(framing.context)}</p>` : ''}${framing.success ? `<p><strong>Success criteria</strong><br>${mdInline(framing.success)}</p>` : ''}</div>
  ${sparring().html}
  ${frameChecks.length ? `<h2>Fit to the problem</h2><ul class="plain">${frameChecks.map((fc) => `<li><strong>${esc(fc.fit || 'unknown')}</strong>${typeof fc.score === 'number' ? ` ${esc(fc.score)}/10` : ''} <span class="meta">${esc(fc.source)}</span><br>${esc(fc.summary || '')}${fc.assumptions_relied_on?.length ? `<br><span class="sub">Rests on: ${fc.assumptions_relied_on.map(esc).join('; ')}</span>` : ''}</li>`).join('')}</ul>` : ''}
  ${tasks.length ? `<h2>Key tasks</h2><table><tr><th>Task</th><th>Verdict</th><th>Score</th><th title="Effectiveness / efficiency / satisfaction, each 0-10, assessed before the score">E / E / S</th><th>Why</th><th>Critic</th></tr>${tasks.map((t) => `<tr><td>${t.id ? `${esc(t.id)} ` : ''}${esc(t.task)}</td><td class="verdict v-${esc(t.verdict)}">${esc(t.verdict)}</td><td>${typeof t.score === 'number' ? `${esc(t.score)}/10${t.coverage === 'partial' ? ' <span class="meta">(partial view, not gated)</span>' : ''}` : '–'}</td><td class="meta">${esc(subscoresOf(t))}</td><td>${esc(t.summary || '')}</td><td class="meta">${esc(t.source)}</td></tr>`).join('')}</table>` : ''}
  ${comparison ? `<h2>Since last run</h2><div class="frame-box"><p>Compared with ${esc(path.basename(comparison.base))}: <strong>${comparison.fixed.length} fixed</strong>, <strong>${comparison.introduced.length} new</strong>, ${comparison.persisting.length} still open${comparison.notRechecked.length ? `, ${comparison.notRechecked.length} on screens not in this run` : ''}.</p>${comparison.fixed.length ? `<ul class="plain">${comparison.fixed.map((f) => `<li><s>${esc(f.title)}</s> <span class="meta">${esc(f.severity)} · ${esc(screenTitle(f.screen))}</span></li>`).join('')}</ul>` : ''}</div>` : ''}
  <h2>Findings</h2>
  <p class="counts">${SEV.map((s) => `<span><span class="sev sev-${s}">${s}</span> ${counts[s]}</span>`).join('')}</p>
  ${global.length ? `<div class="screen"><h3>Across screens</h3><ol class="flist">${global.map((f) => `${findingItem(f, `f${f.n}`)}`).join('')}</ol></div>` : ''}
  ${manifest.screens.map(screenCard).join('\n')}
  ${strengths.length ? `<h2>What works</h2><ul class="plain">${strengths.map((s) => `<li>${esc(s.text)} <span class="meta">${esc(s.source)}${s.basis?.length ? ` · ${esc(s.basis.join(', '))}` : ''}</span></li>`).join('')}</ul>` : ''}
  ${manifest.taste?.length ? `<h2>The direction you chose</h2><div class="frame-box"><div class="thumbs">${manifest.taste.map((t) => `<figure>${link(t, `<img src="${img(t)}" alt="reference">`)}</figure>`).join('')}</div><p class="sub">The critics saw these as the intended direction. Closeness isn't scored, and it never excuses a usability problem.</p></div>` : ''}
  ${review ? reviewHtml() : ''}
  ${decided.length ? `<h2>Decided by you</h2><ul class="plain">${decided.map((f) => `<li>${f.decision.decision === 'dismiss' ? 'Dismissed' : `Re-rated ${esc(f.severity)} → ${esc(f.decision.severity)}`}: ${esc(f.title)} <span class="meta">${esc(screenTitle(f.screen))} · ${esc(f.rule)} · ${esc(f.source)}</span>${f.decision.reason ? `<br><span class="sub">${esc(f.decision.reason)}</span>` : ''}</li>`).join('')}</ul>` : ''}
  ${comparisons.length ? `<h2>Variant comparison</h2><ul class="plain">${comparisons.map((c) => `<li><strong>${esc(c.group)}</strong>: recommend ${esc(c.recommended)}. ${esc(c.reasons || '')}</li>`).join('')}</ul>` : ''}
  <h2>To build this</h2>
  <p class="sub">Platform: <strong>${esc(stack.platform)}</strong> · Stack: <strong>${esc(stack.decided ? stack.stacks.join(', ') : 'not decided')}</strong> · picks come only from catalog/stack.yaml (verified ${esc(stack.verified)}), each with its source.</p>
  ${stack.notes.map((n) => `<p class="sub"><em>${esc(n)}</em></p>`).join('')}
  ${stack.steps.map((st, i) => `<div class="screen"><h3>${i + 1}. ${esc(st.title)}</h3><ul class="plain">${st.picks.map((p) => `<li><strong>${esc(p.name)}</strong> <span class="meta">${esc(p.by)} · ${esc(p.trust)}${stack.decided || st.role === 'prototype' ? '' : ` · for ${esc(p.stacks.join(', '))}`}${p.group && st.picks.filter((x) => x.group === p.group).length > 1 ? ' · alternative' : ''}</span><br>${esc(p.why)}${p.because ? ` <em>${esc(p.because)}.</em>` : ''}<br><code>${esc(p.install)}</code> · ${p.sources.map((u) => `<a href="${esc(u)}">source</a>`).join(' ')}</li>`).join('')}</ul></div>`).join('')}
  ${stack.watch.length ? `<p class="sub">Watched, not recommended yet: ${stack.watch.map((w) => `${esc(w.name)}: ${esc(w.why_not_yet)}`).join(' ')}</p>` : ''}
  ${notExamined.length ? `<h2>Not examined</h2><p class="sub">What the critics say they did not or could not look at; silence on these is not approval.</p><ul class="plain">${notExamined.map((x) => `<li>${esc(x.text)} <span class="meta">${esc(x.source)}</span></li>`).join('')}</ul>` : ''}
  ${notes.length || warnings.length ? `<h2>Notes</h2><ul class="plain">${notes.map((n) => `<li>${esc(n.screen)}: ${esc(n.note)}</li>`).join('')}${warnings.map((w) => `<li>Warning: ${esc(w)}</li>`).join('')}</ul>` : ''}
  <p class="sub">Principle IDs refer to the designcritique principles library. Severity follows Nielsen's frequency, impact and persistence, weighted by task criticality.</p>
  </main></body></html>`;
  return { html, inlined: inline.size };
}
