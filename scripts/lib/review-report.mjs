// Pieces of the whole-product report: the information-architecture map (SVG and Mermaid) and the
// ranked list of proposals (moves, cuts, additions) from the lens reviewers.
import { similarity } from './compare.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A layered map: columns by depth from the start screen, flagged screens outlined. */
export function iaMapSvg(graph, flagged = new Map()) {
  const W = 170; const H = 46; const GX = 70; const GY = 22; const PAD = 16;
  const cols = new Map();
  for (const n of graph.nodes) { const d = Number.isFinite(n.depth) ? n.depth : 0; if (!cols.has(d)) cols.set(d, []); cols.get(d).push(n); }
  const pos = new Map();
  const depths = [...cols.keys()].sort((a, b) => a - b);
  let maxRows = 0;
  depths.forEach((d, ci) => { cols.get(d).forEach((n, ri) => pos.set(n.id, { x: PAD + ci * (W + GX), y: PAD + ri * (H + GY) })); maxRows = Math.max(maxRows, cols.get(d).length); });
  const width = PAD * 2 + depths.length * W + (depths.length - 1) * GX;
  const height = PAD * 2 + maxRows * H + (maxRows - 1) * GY;
  const edges = graph.edges.map((e) => {
    const a = pos.get(e.from); const b = pos.get(e.to);
    if (!a || !b) return '';
    const back = b.x <= a.x;
    const x1 = back ? a.x : a.x + W; const y1 = a.y + H / 2; const x2 = back ? b.x + W : b.x; const y2 = b.y + H / 2;
    const c = back ? -60 : 40;
    return `<path class="edge${back ? ' back' : ''}" d="M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}" marker-end="url(#arrow)"><title>${esc(e.labels.join(', '))}</title></path>`;
  }).join('');
  const nodes = graph.nodes.map((n) => {
    const p = pos.get(n.id);
    const flag = flagged.get(n.title);
    const title = n.title.length > 24 ? `${n.title.slice(0, 23)}…` : n.title;
    return `<g class="node${flag ? ' flagged' : ''}${n.id === graph.start ? ' start' : ''}"><rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="10"/><text x="${p.x + 10}" y="${p.y + 19}">${esc(title)}</text><text class="sub" x="${p.x + 10}" y="${p.y + 36}">${n.kind === 'sheet' ? 'sheet · ' : ''}${n.states.length} state${n.states.length === 1 ? '' : 's'}${flag ? ` · ${esc(flag.length > 16 ? `${flag.split(',')[0]} +` : flag)}` : ''}</text><title>${esc(n.title)}</title></g>`;
  }).join('');
  return `<svg class="iamap" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Map of ${graph.nodes.length} screens by depth from the start screen"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>${edges}${nodes}</svg>`;
}

export function iaMapMermaid(graph) {
  const id = (n) => n.replace(/[^A-Za-z0-9]/g, '');
  const label = (s) => String(s).replace(/"/g, "'");
  const L = ['```mermaid', 'flowchart LR'];
  for (const n of graph.nodes) L.push(`  ${id(n.id)}["${label(n.title)}"]`);
  for (const e of graph.edges) L.push(`  ${id(e.from)} -->|"${label(e.labels[0])}${e.labels.length > 1 ? ' …' : ''}"| ${id(e.to)}`);
  L.push('```');
  return L.join('\n');
}

const IMPACT = { high: 0, medium: 1, low: 2 };
const SEV = { P0: 0, P1: 1, P2: 2, P3: 3 };
const same = (a, b) => similarity(a, b) >= 0.5 || String(a).toLowerCase().trim() === String(b).toLowerCase().trim();

/**
 * One ranked list of proposals: moves (M1…) and scope verdicts other than keep (S1…), merged when
 * two reviewers propose the same thing, ranked by impact, linked severity and agreement.
 */
export function rankProposals({ moves = [], scope = [], findings = [], decisions = [] }) {
  const out = [];
  const sevOf = (fid) => {
    const f = fid && findings.find((x) => x.id === fid || x.id?.endsWith(`-${fid}`) || (x.also || []).some((a) => a.id === fid));
    return f ? SEV[f.severity] ?? 3 : 3;
  };
  for (const m of moves) {
    const prev = out.find((p) => p.type === 'move' && same(p.item, m.item) && same(p.to, m.to));
    if (prev) { prev.sources.push(m.source); prev.impact = [prev.impact, m.impact].sort((a, b) => (IMPACT[a] ?? 1) - (IMPACT[b] ?? 1))[0]; continue; }
    out.push({ type: 'move', verdict: 'move', item: m.item, from: m.from || '', to: m.to, reason: m.reason, impact: m.impact || 'medium', sources: [m.source], sev: sevOf(m.finding_id) });
  }
  for (const s of scope.filter((x) => x.verdict && x.verdict !== 'keep')) {
    const prev = out.find((p) => p.type === 'scope' && p.verdict === s.verdict && same(p.item, s.feature));
    if (prev) { prev.sources.push(s.source); continue; }
    out.push({ type: 'scope', verdict: s.verdict, item: s.feature, from: s.phase || '', to: s.verdict === 'defer' ? 'later' : '', reason: s.reason || '', impact: s.verdict === 'add' || s.verdict === 'cut' ? 'high' : 'medium', job: s.job, task: s.task, sources: [s.source], sev: sevOf(s.finding_id) });
  }
  let m = 0; let s = 0;
  for (const p of out) p.id = p.type === 'move' ? `M${++m}` : `S${++s}`;
  for (const p of out) {
    const d = decisions.find((x) => x.kind === 'proposal' && same(x.item, p.item) && (x.verdict || 'move') === p.verdict && (!x.to || !p.to || same(x.to, p.to)));
    if (d) p.decision = { decision: d.decision, reason: d.reason };
  }
  return out.sort((a, b) => (IMPACT[a.impact] ?? 1) - (IMPACT[b.impact] ?? 1) || a.sev - b.sev || b.sources.length - a.sources.length);
}
