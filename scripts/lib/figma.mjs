// A Figma prototype as a navigation graph. Figma's REST API returns, per file, the pages with
// their flow starting points and, per node, its prototype interactions (trigger and actions
// with a destination). That is the same information the crawler produces by tapping, so it is
// written in the crawler's inventory shape and the structure checks (ways back, dead ends,
// depth, orphans, labels that lead to two places) run on a design before any code exists.
// Fields per Figma's published OpenAPI spec (github.com/figma/rest-api-spec): CANVAS
// `flowStartingPoints`, `prototypeStartNodeID`; node `interactions[].actions[]` with
// `type`, `destinationId`, `navigation`; the older `transitionNodeID`.
import crypto from 'node:crypto';

const FRAME_TYPES = new Set(['FRAME', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET']);
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'frame';
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

/** The top-level frames of a page: its direct frames and those inside sections. */
function topFrames(page) {
  const out = [];
  const walk = (nodes) => { for (const n of nodes || []) { if (n.type === 'SECTION') walk(n.children); else if (FRAME_TYPES.has(n.type) && n.visible !== false) out.push(n); } };
  walk(page.children);
  return out;
}
const textsOf = (node, out = []) => { if (node.type === 'TEXT' && node.characters && node.visible !== false) out.push(node.characters.replace(/\s+/g, ' ').trim()); for (const c of node.children || []) textsOf(c, out); return out; };

/**
 * file: the JSON of GET /v1/files/:key. Returns { pages, frames, inventory, mockups, unreachable }.
 * opts.page: only this page (by name). opts.imageDir: folder the frame PNGs are (or will be) in.
 */
export function figmaToInventory(file, { page: onlyPage = null, imageDir = 'figma' } = {}) {
  const pages = (file.document?.children || []).filter((p) => p.type === 'CANVAS' && (!onlyPage || p.name === onlyPage));
  const frames = [];
  const frameOf = new Map(); // any node id -> its top-level frame
  const ids = new Set();
  for (const p of pages) {
    for (const f of topFrames(p)) {
      let id = slug(f.name);
      for (let i = 2; ids.has(id); i++) id = `${slug(f.name)}-${i}`;
      ids.add(id);
      const fr = { node: f, nodeId: f.id, id, title: f.name, page: p.name, text: textsOf(f).join('\n'), actions: [] };
      frames.push(fr);
      const mark = (n) => { frameOf.set(n.id, fr); for (const c of n.children || []) mark(c); };
      mark(f);
    }
  }
  // Every interaction on any node inside a frame is an action of that frame.
  for (const fr of frames) {
    const visit = (n) => {
      const label = (n.type === 'TEXT' ? n.characters : textsOf(n)[0]) || n.name || 'control';
      const acts = [...(n.interactions || []).flatMap((i) => (i.actions || []).filter(Boolean).map((a) => ({ ...a, trigger: i.trigger?.type || null })))];
      if (n.transitionNodeID && !acts.some((a) => a.destinationId === n.transitionNodeID)) acts.push({ type: 'NODE', destinationId: n.transitionNodeID, navigation: 'NAVIGATE', trigger: 'ON_CLICK' });
      for (const a of acts) {
        const rec = { label: String(label).replace(/\s+/g, ' ').trim().slice(0, 80), role: 'figma', trigger: a.trigger };
        if (a.type === 'BACK' || a.type === 'CLOSE') rec.back = true;
        else if (a.type === 'URL') rec.skipped = 'external link';
        else if (a.type === 'NODE' && a.destinationId && frameOf.has(a.destinationId)) { rec.toFrame = frameOf.get(a.destinationId); rec.navigation = a.navigation || 'NAVIGATE'; }
        else continue; // variable, conditional and media actions don't navigate
        fr.actions.push(rec);
      }
      for (const c of n.children || []) visit(c);
    };
    visit(fr.node);
  }
  // Starting points: the page's flows, else its prototype start node, else its first frame.
  const starts = [];
  for (const p of pages) {
    const named = (p.flowStartingPoints || []).map((s) => ({ frame: frameOf.get(s.nodeId), flow: s.name })).filter((s) => s.frame);
    if (named.length) starts.push(...named);
    else if (p.prototypeStartNodeID && frameOf.get(p.prototypeStartNodeID)) starts.push({ frame: frameOf.get(p.prototypeStartNodeID), flow: p.name });
    else { const first = frames.find((f) => f.page === p.name); if (first) starts.push({ frame: first, flow: p.name }); }
  }
  // Breadth-first from the starts: depth, the flow a frame belongs to, and its step in it.
  const info = new Map();
  const queue = [];
  for (const s of starts) if (!info.has(s.frame)) { info.set(s.frame, { depth: 0, flow: s.flow, start: s.frame.id, path: [] }); queue.push(s.frame); }
  while (queue.length) {
    const fr = queue.shift();
    const at = info.get(fr);
    for (const a of fr.actions) if (a.toFrame && !info.has(a.toFrame)) { info.set(a.toFrame, { depth: at.depth + 1, flow: at.flow, start: at.start, path: [...at.path, a.label] }); queue.push(a.toFrame); }
  }
  const reached = frames.filter((f) => info.has(f));
  const stateId = new Map(reached.map((f, i) => [f, `s${String(i + 1).padStart(2, '0')}-${f.id}`.slice(0, 44)]));
  const transitions = [];
  const states = reached.map((f) => {
    const at = info.get(f);
    const overlay = frames.some((g) => g.actions.some((a) => a.toFrame === f && a.navigation === 'OVERLAY'));
    return {
      id: stateId.get(f), title: f.title, kind: overlay ? 'sheet' : 'screen', screenKey: sha(f.nodeId), stateKey: sha(`s${f.nodeId}`),
      start: at.start, depth: at.depth, steps: at.path.map((l) => ({ tap: l })), mockup: f.id, figmaNode: f.nodeId,
      screenshot: `${imageDir}/${f.id}.png`, snapshot: f.text, actions: [],
    };
  });
  const byFrame = new Map(reached.map((f, i) => [f, states[i]]));
  for (const f of reached) {
    const st = byFrame.get(f);
    for (const a of f.actions) {
      if (a.skipped) { st.actions.push({ label: a.label, role: a.role, skipped: a.skipped }); continue; }
      if (a.back) {
        // Back and close return to wherever the person came from: every frame that leads here.
        const from = reached.filter((g) => g !== f && g.actions.some((x) => x.toFrame === f));
        st.actions.push({ label: a.label, role: a.role, to: from[0] ? byFrame.get(from[0]).id : st.id, effect: 'back' });
        for (const g of from) transitions.push({ from: st.id, to: byFrame.get(g).id, label: a.label });
        continue;
      }
      const to = byFrame.get(a.toFrame);
      st.actions.push({ label: a.label, role: a.role, to: to.id, effect: to === st ? 'no visible change' : 'known state' });
      if (to !== st) transitions.push({ from: st.id, to: to.id, label: a.label });
    }
  }
  const inventory = {
    generatedAt: new Date().toISOString(), complete: true, source: 'figma',
    start: starts[0]?.frame.id || null, starts: [...new Set(starts.map((s) => s.frame.id))],
    device: 'Figma prototype', languages: ['en'],
    limits: { reached: false },
    method: 'Prototype interactions read from the Figma file (flow starting points, per-node actions and destinations), in the crawler\'s inventory shape',
    states, screens: states.map((s) => ({ screenKey: s.screenKey, title: s.title, kind: s.kind, states: [s.id] })), transitions,
  };
  const mockups = frames.map((f) => {
    const at = info.get(f);
    return { id: f.id, title: f.title, file: `${imageDir}/${f.id}.png`, ...(at ? { flow: slug(at.flow), step: at.depth + 1 } : {}), figma_node: f.nodeId };
  });
  return { pages: pages.map((p) => p.name), frames, inventory, mockups, unreachable: frames.filter((f) => !info.has(f)).map((f) => f.title) };
}
