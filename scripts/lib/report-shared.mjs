// What both report formats share: the caps on long evidence, small formatters, and the parts
// written once for Markdown and HTML alike (the cold reading beside the frame, the questions).
import { isDeterministic } from './merge.mjs';

export const SEV = ['P0', 'P1', 'P2', 'P3'];
export const STANCES = { hold: 'holds its position', concede: 'concedes', revise: 'revises' };
// Long evidence (every overlap on every variant, hundreds of screen names) is cut in the report;
// findings.json keeps it whole.
const MAX_LINES = 8;
const MAX_LINE = 400;
const MAX_NAMES = 12;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const mdInline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
export function pastTense(d) { return { accept: 'accepted', reject: 'rejected', defer: 'deferred' }[d] || d; }
export function criticsOf(f) { return [...new Set((f.raisedBy || []).filter((s) => !isDeterministic({ source: s })))]; }
export function md(s) { return String(s ?? '').replace(/\|/g, '\\|'); }
export function subscoresOf(t) {
  const x = t.subscores;
  return x && [x.effectiveness, x.efficiency, x.satisfaction].some((v) => typeof v === 'number') ? [x.effectiveness, x.efficiency, x.satisfaction].map((v) => (typeof v === 'number' ? v : '–')).join(' / ') : '';
}
export function capLines(s) {
  const lines = String(s ?? '').split('\n').map((l) => (l.length > MAX_LINE ? `${l.slice(0, MAX_LINE)}…` : l));
  return lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `…and ${lines.length - MAX_LINES} more (findings.json has them all)`].join('\n') : lines.join('\n');
}
export function capList(items, max = MAX_NAMES) {
  return items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', ');
}
export function agreementNote(f) {
  if (f.agreement === 'critics-agree') return `raised by ${criticsOf(f).length} critics: higher confidence`;
  if (f.agreement === 'check-and-critic') return 'measured by a check and raised by a critic';
  if (f.agreement === 'rendered-and-source') return 'found on the rendered screen and in its source';
  return '';
}

/** The helpers that need the run: screen titles, where a finding is, the sparring sections. */
export function reportHelpers(ctx) {
  const { manifest, coldReading, framing, challenges } = ctx;
  const screenTitle = (id) => (id === '*' ? 'All screens' : manifest.screens.find((s) => s.id === id)?.title || id);
  function whereOf(f) {
    if (f.screens) return `${f.screens.length} screens: ${capList(f.screens.map(screenTitle))}`;
    return `${screenTitle(f.screen)}${f.platform ? ` (${f.platform})` : ''}`;
  }
  function sparring() {
    const out = { md: [], html: '' };
    const KIND = { 'first-read': 'First read', assumption: 'Assumption', premortem: 'Pre-mortem', alternative: 'Alternative', 'blind-spot': 'Blind spot' };
    if (coldReading) {
      const rows = [['What it is', coldReading.product, framing.purpose], ['Who it is for', coldReading.audience, framing.users], ['The problem it solves', coldReading.problem, framing.problem], ['What you can do', (coldReading.tasks || []).join('; '), framing.tasks]];
      out.md.push('## Read cold', '', 'What a reviewer who was told nothing took the screens for, beside what PRODUCT.md says. A difference is a question, not a defect: the screens may not say it, or the frame may not be what was built.', '', '| | Read cold | Your frame |', '|---|---|---|', ...rows.map(([k, a, b]) => `| ${k} | ${md(String(a || '–')).replace(/\n+/g, ' ')} | ${md(String(b || '–')).replace(/\n+/g, ' ')} |`), '');
      if (coldReading.unclear?.length) out.md.push(`Could not work out: ${coldReading.unclear.map(md).join('; ')}.`, '');
      out.html += `<h2>Read cold</h2><p class="sub">What a reviewer who was told nothing took the screens for, beside what PRODUCT.md says. A difference is a question, not a defect: the screens may not say it, or the frame may not be what was built.${coldReading.confidence ? ` Reader's confidence: ${esc(coldReading.confidence)}.` : ''}</p><table><tr><th></th><th>Read cold</th><th>Your frame</th></tr>${rows.map(([k, a, b]) => `<tr><th>${k}</th><td>${mdInline(String(a || '–'))}</td><td>${mdInline(String(b || '–'))}</td></tr>`).join('')}</table>${coldReading.unclear?.length ? `<p class="sub">Could not work out: ${coldReading.unclear.map(esc).join('; ')}.</p>` : ''}`;
    }
    if (challenges.length) {
      out.md.push('## Questions for you', '', 'Objections and open questions from the critics, about the frame, the concept or a choice. They are positions to argue with, not defects: none counts in the gate. Answer one with `/designcritique:decide C1 "…"`.', '');
      for (const c of challenges) {
        out.md.push(`**${c.n}. ${md(c.claim)}** _(${KIND[c.kind] || c.kind}; ${c.source}${c.confidence ? `; ${c.confidence} confidence` : ''}${c.basis?.length ? `; ${c.basis.join(', ')}` : ''})_  `, `${md(c.question)}`, '');
        if (c.why) out.md.push(`- Why: ${md(c.why)}`);
        if (c.if_wrong) out.md.push(`- If so: ${md(c.if_wrong)}`);
        if (c.answer) out.md.push(`- Your answer (${c.answer.date || ''}): ${md(c.answer.text)}`);
        out.md.push('');
      }
      out.html += `<h2>Questions for you</h2><p class="sub">Objections and open questions from the critics, about the frame, the concept or a choice. They are positions to argue with, not defects: none counts in the gate.</p><ol class="plain">${challenges.map((c) => `<li value="${c.n.slice(1)}"><strong>${esc(c.n)}. ${esc(c.claim)}</strong> <span class="meta">${esc(KIND[c.kind] || c.kind)} · ${esc(c.source)}${c.confidence ? ` · ${esc(c.confidence)} confidence` : ''}${c.basis?.length ? ` · ${esc(c.basis.join(', '))}` : ''}</span><br>${esc(c.question)}${c.why ? `<br><span class="sub">Why: ${esc(c.why)}</span>` : ''}${c.if_wrong ? `<br><span class="sub">If so: ${esc(c.if_wrong)}</span>` : ''}${c.answer ? `<br><em>Your answer:</em> ${esc(c.answer.text)}` : ''}</li>`).join('')}</ol>`;
    }
    return out;
  }
  return { screenTitle, whereOf, sparring };
}
