// report.md: the run as Markdown. The data comes ready from scripts/report/render-report.mjs.
import path from 'node:path';
import { stackMarkdown } from './stack.mjs';
import { iaMapMermaid } from './review-report.mjs';
import { unfilledMessage } from './framing.mjs';
import { SEV, STANCES, md, capLines, capList, subscoresOf, agreementNote, pastTense, reportHelpers } from './report-shared.mjs';

export function renderMarkdown(ctx) {
  const { CATEGORIES, DECISIONS_REL, all, args, baseDir, byKey, captureOf, challenges, checkFindings, checkStatus, coldReading, comparison, comparisons, consistencyInv, counts, coverageData, criticValidity, criticalIds, criticalJourneys, critics, critiqueDir, decided, decisions, dropped, failedCaptures, findings, firstSection, flagged, frameCheck, frameChecks, framing, framingText, gate, gateCfg, graph, htmlScreens, incomplete, journeysJudged, journeysRun, keyTasks, limit, lost, manifest, merged, moves, notExamined, notes, onePerProblem, open, overallScores, pageTitle, productM, proposals, review, runDir, same, scopeVerdicts, screenIds, screenOrder, stack, strengths, tasks, tasksText, unfilled, warnings } = ctx;
  const { screenTitle, whereOf, sparring } = reportHelpers(ctx);
  const L = [];
  L.push(`# Design critique: ${framing.title}`, '', `${new Date().toISOString().slice(0, 10)} · ${merged.coverage.screens} screens · ${merged.coverage.renders} renders · critics: ${merged.coverage.critics.join(', ') || 'none yet (checks only)'}`, '');
  L.push(gate.off
    ? `**Gate: off.**${gate.reasons.length ? ` Would have counted: ${gate.reasons.join('; ')}.` : ''}`
    : `**Gate: ${gate.pass ? 'passed' : 'not passed'}** (fail on ${gate.gate.fail_on}, target score ${gate.gate.target_score ?? 'none'})${gate.pass ? '' : `: ${gate.reasons.join('; ')}`}.`, '');
  L.push(`_${merged.basis}_`, '');
  L.push('## The problem', '');
  if (!framingText) L.push('_No PRODUCT.md was provided, so task fit could not be judged. Run the frame skill first._', '');
  else {
    if (unfilled.length) L.push(`_${unfilledMessage(unfilled)}_`, '');
    if (framing.problem) L.push(framing.problem, '');
    if (framing.users) L.push('**Users**', '', framing.users, '');
    if (framing.tasks) L.push('**Key tasks**', '', framing.tasks, '');
    if (framing.context) L.push('**Context of use**', '', framing.context, '');
    if (framing.success) L.push('**Success criteria**', '', framing.success, '');
    if (framing.assumptions.length) L.push('**Open assumptions**', '', ...framing.assumptions.map((a) => `- ${a}`), '');
  }
  L.push(...sparring().md);
  if (frameChecks.length) {
    L.push('## Fit to the problem', '');
    for (const fc of frameChecks) {
      L.push(`- **${fc.fit || 'unknown'}**${typeof fc.score === 'number' ? ` ${fc.score}/10` : ''} (${fc.source}): ${md(fc.summary || '')}${fc.assumptions_relied_on?.length ? ` _Rests on: ${fc.assumptions_relied_on.map(md).join('; ')}_` : ''}`);
    }
    L.push('');
  }
  if (tasks.length) {
    L.push('## Key tasks', '', '| Task | Verdict | Score | Effective / efficient / satisfying | Why | Critic |', '|---|---|---|---|---|---|');
    for (const t of tasks) L.push(`| ${t.id ? `${t.id} ` : ''}${md(t.task)} | ${t.verdict} | ${typeof t.score === 'number' ? `${t.score}/10${t.coverage === 'partial' ? ' (partial view, not gated)' : ''}` : '–'} | ${subscoresOf(t)} | ${md(t.summary || '')} | ${t.source} |`);
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
      L.push(`**${f.n}. ${md(f.title)}**${f.status === 'new' ? ' _(new)_' : ''}${agreementNote(f) ? ` _(${agreementNote(f)})_` : ''}  `, `${whereOf(f)} · ${f.basis.join(', ')} · ${(f.raisedBy || [f.source]).join(' + ')}${f.carried_from ? ` · carried from ${f.carried_from} (screen unchanged)` : ''}${f.confidence !== 'high' ? ` · ${f.confidence} confidence` : ''}`, '');
      L.push(`- Evidence: ${md(capLines(f.evidence)).replace(/\n/g, '; ')}`);
      if (f.impact) L.push(`- Impact: ${md(f.impact)}`);
      L.push(`- Fix: ${md(f.recommendation)}`);
      if (f.alternatives?.length) L.push(`- Other ways: ${f.alternatives.map(md).join('; ')}`);
      for (const x of f.decision?.discussion || []) L.push(`- ${x.stance ? `${x.by} (${STANCES[x.stance] || x.stance})` : `You (${x.by})`}: ${md(x.text)}`);
      for (const a of f.also || []) L.push(`- Also raised by ${a.source} (${a.severity}): ${md(a.title)}${a.evidence ? `. ${md(capLines(a.evidence)).replace(/\n/g, '; ')}` : ''}${a.recommendation ? ` Its fix: ${md(a.recommendation)}` : ''}`);
      L.push('');
    }
  }
  if (strengths.length) L.push('## What works', '', ...strengths.map((s) => `- ${md(s.text)} _(${s.source})_${s.screen && s.screen !== '*' ? ` (${screenTitle(s.screen)})` : ''}${s.basis?.length ? ` · ${s.basis.join(', ')}` : ''}`), '');
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
      if (coverageData.notCovered?.length) L.push(`Not covered by the crawl (tooling, not the prototype; left out of the dead-end and way-back checks and the gate): ${coverageData.notCovered.length} state(s). ${md(capList(coverageData.notCovered.map((u) => `${u.title} (${u.state}): ${u.reason}`), 8))}.`, '');
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
      for (const p of proposals) L.push(`- **${p.id}** ${p.type === 'move' ? `Move **${md(p.item)}**${p.from ? ` from ${md(p.from)}` : ''} to **${md(p.to)}**` : `${p.verdict[0].toUpperCase()}${p.verdict.slice(1)} **${md(p.item)}**`}: ${md(p.reason)} _(${p.impact} impact; ${p.sources.join(' + ')})_${p.decision ? ` · **${pastTense(p.decision.decision)} by you**${p.decision.reason ? `: ${md(p.decision.reason)}` : ''}` : ''}`);
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
    for (const f of decided) L.push(`- ${f.decision.decision === 'dismiss' ? 'Dismissed' : `Re-rated ${f.severity} → ${f.decision.severity}`}: ${md(f.title)} (${screenTitle(f.screen)}, ${f.rule}, ${f.source})${f.decision.reason ? `. ${md(f.decision.reason)}` : ''}${(f.decision.discussion || []).filter((x) => x.stance).map((x) => ` ${x.by} ${STANCES[x.stance] || x.stance}: ${md(x.text)}`).join('')}`);
    L.push('');
  }
  L.push(stackMarkdown(stack), '');
  if (notExamined.length) L.push('## Not examined', '', 'What the critics say they did not or could not look at; silence on these is not approval.', '', ...notExamined.map((x) => `- ${md(x.text)} _(${x.source})_`), '');
  if (notes.length || warnings.length) L.push('## Notes', '', ...notes.map((n) => `- ${n.screen}: ${n.note}`), ...warnings.map((w) => `- Warning: ${w}`), '');
  L.push('---', 'Principle IDs refer to the designcritique principles library (skills/principles). Severity follows Nielsen\'s frequency, impact and persistence, weighted by task criticality.');
  return L.join('\n') + '\n';
}
