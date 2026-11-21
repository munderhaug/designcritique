#!/usr/bin/env node
// Crawl a single-page prototype: tap every control, record each distinct screen, sheet and state,
// and write <run>/inventory.json (states, how to reach each one, transitions between them).
//
// Method: event-driven crawling into a state-flow graph (Mesbah, van Deursen & Lenselink,
// "Crawling AJAX-based web applications through dynamic analysis of user interface state
// changes", ACM TWeb 2012 — Crawljax), backtracking by reloading and replaying the path, with
// DroidBot-style two-level state IDs (Li et al., MOBILESoft 2017) from Playwright's
// accessibility snapshot. Each state's shortest path is written as `steps:`, so capture can
// reach it again (node scripts/capture/capture.mjs --inventory <run>/inventory.json).
//
// Tooling failures are kept apart from what the prototype does: a state whose path can't be
// replayed is marked `unexplored: "replay failed"`, and a tap that fails is recorded as an
// `error`, never as "leads nowhere". inventory.json is written every few states, so a crash
// keeps what was found.
//
// Usage: node scripts/crawl/crawl.mjs --config mockups.yaml --out <RUN_DIR> [--max-states 60] [--offline]
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, parseArgs, writeJson, timestamp, slug, DEVICE_PRESETS, isRemote, pageUrl } from '../lib/config.mjs';
import { expandMockup } from '../lib/sources.mjs';
import { launch, preparePage, pageFingerprint, settle, runSetupAndSteps, browserGone } from '../lib/browser.mjs';
import { loadVocabulary, languagesOf } from '../lib/vocabulary.mjs';

const args = parseArgs(process.argv.slice(2));
const cfg = loadConfig(args.config || 'mockups.yaml');
const runDir = path.resolve(args.out || path.join(cfg.output, timestamp()));
const opts = { ...(cfg.crawl || { start: cfg.mockups[0].id, max_states: 60, max_actions: 40, max_depth: 8, avoid: [], fill: {} }) };
opts.starts = opts.starts || [opts.start];
if (args['max-states']) opts.max_states = Number(args['max-states']);
const SAVE_EVERY = 5;

// Each start: the page it loads and the device it is crawled at.
const starts = new Map();
for (const id of opts.starts) {
  const page0 = expandMockup(cfg.mockups.find((m) => m.id === id), runDir).screens[0];
  if (!page0 || page0.kind !== 'html') { console.error(`crawl.start ${id} must be an HTML page`); process.exit(2); }
  starts.set(id, {
    page0, url: pageUrl(page0.source), offline: args.offline && !isRemote(page0.source),
    preset: DEVICE_PRESETS[page0.platform === 'android' ? 'android' : 'ios'].standard,
  });
}
const first = starts.get(opts.starts[0]);
fs.mkdirSync(path.join(runDir, 'crawl'), { recursive: true });

let browser = await launch();
// Controls the crawler never presses (destructive, paying, signing out), in the prototype's
// languages (catalog/vocabulary.yaml, <html lang>, `language:` and `vocabulary:` in mockups.yaml).
let vocab = null;
const avoided = (name) => vocab.avoid.test(name) || opts.avoid.some((a) => name.toLowerCase().includes(a.toLowerCase()));
async function openOnce(startId, steps) {
  const { page0, url, offline, preset } = starts.get(startId);
  const ctx = await browser.newContext({ viewport: { width: preset.width, height: preset.height }, deviceScaleFactor: 1, hasTouch: true, colorScheme: 'light' });
  try {
    ctx.on('page', (p) => { if (p !== ctx.pages()[0]) p.close().catch(() => {}); });
    const page = await preparePage(ctx, url, 'light', { ...page0, steps: [...(page0.steps || []), ...steps] }, { top: preset.safeTop, bottom: preset.safeBottom }, { offline });
    for (const [selector, value] of Object.entries(opts.fill)) {
      const el = page.locator(selector).first();
      if (await el.isVisible().catch(() => false) && !(await el.inputValue().catch(() => ''))) await el.fill(String(value)).catch(() => {});
    }
    return { ctx, page };
  } catch (e) {
    await ctx.close().catch(() => {});
    throw e;
  }
}
// A crashed browser fails every later state: start a new one and try once more.
async function open(startId, steps) {
  try { return await openOnce(startId, steps); } catch (e) {
    if (!browserGone(e)) throw e;
    process.stderr.write('browser closed; relaunching\n');
    await browser.close().catch(() => {});
    browser = await launch();
    return openOnce(startId, steps);
  }
}

// Controls a person could tap now, with a replayable step (tap by accessible name when unique,
// else a CSS path). Walks open shadow roots (web components render their native button or tab
// there) and keeps only controls on top: one under an open sheet, or under the page pushed over
// it, can't be tapped, so trying it only times out.
async function listActions(page) {
  return page.evaluate(() => {
    const SEL = 'a[href],button,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=switch],[role=checkbox],[role=radio],input[type=checkbox],input[type=radio],select';
    const W = innerWidth; const H = innerHeight;
    const { up, within, deepHit, deepAll, shown, topModal, nameOf: ownName, text } = window.__dc; // scripts/lib/page-helpers.mjs
    // The light-DOM element a tap or a CSS path can address: the outermost shadow host.
    const hostOf = (el) => { let e = el; while (e.getRootNode() instanceof ShadowRoot) e = e.getRootNode().host; return e; };
    const blocked = (el) => { for (let e = el; e; e = up(e)) if (e.nodeType === 1 && (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true' || e.hasAttribute('inert'))) return true; return false; };
    const scroller = (el) => {
      for (let e = up(el); e && e !== document.body && e !== document.documentElement; e = up(e)) {
        const cs = getComputedStyle(e);
        if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth)) return e;
      }
      return null;
    };
    const onTop = (el, target) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2; const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x >= W || y >= H) {
        // Below the fold: a tap scrolls to it, unless what it scrolls in is itself covered (a
        // page pushed over it): test the visible middle of its scrolling container.
        const sc = scroller(el);
        if (!sc) return true;
        const b = sc.getBoundingClientRect();
        const cx = (Math.max(b.left, 0) + Math.min(b.right, W)) / 2; const cy = (Math.max(b.top, 0) + Math.min(b.bottom, H)) / 2;
        if (cx <= 0 || cy <= 0) return false;
        const hit = deepHit(cx, cy);
        return !!hit && within(hit, sc);
      }
      const hit = deepHit(x, y);
      return !!hit && (within(hit, el) || within(hit, target));
    };
    const all = deepAll(document, SEL);
    // An open modal dialog or sheet: only its controls can be tapped.
    const modal = topModal();
    // Unnamed icon controls: a label, title or icon name somewhere inside, light or shadow DOM.
    const innerHint = (el) => {
      const stack = [el];
      while (stack.length) {
        const n = stack.shift();
        for (const c of [...(n.children || []), ...(n.shadowRoot ? n.shadowRoot.children : [])]) {
          const hint = c.getAttribute('aria-label') || c.getAttribute('title') || c.getAttribute('alt') || (c.tagName.includes('-') || c.tagName === 'svg' ? c.getAttribute('name') || c.getAttribute('icon') || c.querySelector?.('title')?.textContent : null);
          if (hint) return text(hint);
          stack.push(c);
        }
      }
      return '';
    };
    const cssPath = (el) => {
      if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
      const parts = [];
      for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
        if (e !== el && e.id && document.querySelectorAll(`#${CSS.escape(e.id)}`).length === 1) { parts.unshift(`#${CSS.escape(e.id)}`); return parts.join(' > '); }
        const sibs = [...(e.parentElement?.children || [])].filter((x) => x.tagName === e.tagName);
        parts.unshift(`${e.tagName.toLowerCase()}${sibs.length > 1 ? `:nth-of-type(${sibs.indexOf(e) + 1})` : ''}`);
      }
      return `body > ${parts.join(' > ')}`;
    };
    const out = [];
    const seen = new Set();
    for (const el of all) {
      const target = hostOf(el);
      if (seen.has(target)) continue;
      if (!shown(el) || !shown(target) || el.disabled || el.getAttribute('aria-disabled') === 'true' || blocked(el)) continue;
      if (modal && !within(el, modal)) continue;
      if (!onTop(el, target)) continue;
      seen.add(target);
      const href = el.getAttribute('href');
      let external = false;
      if (href) {
        try { const u = new URL(href, location.href); external = /^(mailto|tel|sms):/.test(u.protocol) || (u.protocol !== location.protocol || u.host !== location.host) || el.target === '_blank'; } catch { external = true; }
      }
      const name = (ownName(el) || (target !== el ? ownName(target) : '')).slice(0, 80);
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      out.push({ name, hint: name ? '' : innerHint(target).slice(0, 40), role, selector: cssPath(target), external });
    }
    const counts = {};
    for (const a of out) counts[a.name] = (counts[a.name] || 0) + 1;
    return out.map((a) => ({ ...a, step: a.name && counts[a.name] === 1 ? { tap: a.name } : { click: a.selector } }));
  });
}

// A label a person can read: the accessible name, else an icon's name, else the role and
// where it sits; the CSS path stays in `step` for replay.
const labelOf = (a) => a.name || (a.hint ? `${a.role} "${a.hint}"` : `${a.role} at ${a.selector.split(' > ').slice(-2).join(' > ')}`);

const states = new Map(); // stateKey -> state
const ordered = [];
const transitions = [];
let limited = false;

function save(complete) {
  const screens = [];
  for (const st of ordered) {
    let sc = screens.find((x) => x.screenKey === st.screenKey);
    if (!sc) { sc = { screenKey: st.screenKey, title: st.title, kind: st.kind, states: [] }; screens.push(sc); }
    sc.states.push(st.id);
  }
  writeJson(path.join(runDir, 'inventory.json'), {
    generatedAt: new Date().toISOString(),
    complete,
    start: opts.starts[0],
    starts: opts.starts,
    device: first.preset.name,
    languages: vocab?.languages || ['en'],
    limits: { max_states: opts.max_states, max_actions: opts.max_actions, max_depth: opts.max_depth, reached: limited },
    method: 'Event-driven state-flow crawl (Crawljax) with accessibility-snapshot state IDs (DroidBot-style screen and state keys)',
    states: ordered,
    screens,
    transitions,
  });
  return screens;
}

const addState = async (page, fp, steps, depth, start) => {
  const id = `s${String(ordered.length + 1).padStart(2, '0')}-${slug(fp.title).slice(0, 30)}`;
  const shot = path.join(runDir, 'crawl', `${id}.png`);
  await page.screenshot({ path: shot }).catch(() => {});
  const st = { id, title: fp.title, kind: fp.kind, screenKey: fp.screenKey, stateKey: fp.stateKey, start, depth, steps, screenshot: path.relative(runDir, shot), snapshot: fp.snapshot, actions: [] };
  states.set(fp.stateKey, st);
  ordered.push(st);
  return st;
};

let failed = null;
try {
  for (const startId of opts.starts) {
    const { ctx, page } = await open(startId, []);
    try {
      if (!vocab) {
        const lang = await page.evaluate(() => document.documentElement.lang || null);
        vocab = loadVocabulary(languagesOf([cfg.language, lang]), cfg.vocabulary);
        if (vocab.unknown.length) process.stderr.write(`warning: no vocabulary for ${vocab.unknown.join(', ')} in catalog/vocabulary.yaml; using ${vocab.languages.join(', ')}\n`);
      }
      const fp = await pageFingerprint(page);
      if (!states.has(fp.stateKey)) await addState(page, fp, [], 0, startId);
    } finally { await ctx.close().catch(() => {}); }
  }
  for (let qi = 0; qi < ordered.length; qi++) {
    const st = ordered[qi];
    if (qi && qi % SAVE_EVERY === 0) save(false);
    if (st.depth >= opts.max_depth) { st.unexplored = 'max depth'; continue; }
    let actions;
    try {
      const { ctx, page } = await open(st.start, st.steps);
      try { actions = await listActions(page); } finally { await ctx.close().catch(() => {}); }
    } catch (e) {
      // The path that found this state doesn't replay: say so, and go on with the others.
      st.unexplored = 'replay failed';
      st.replayError = e.message.split('\n')[0];
      process.stderr.write(`${st.id}: replay failed (${st.replayError})\n`);
      continue;
    }
    if (actions.length > opts.max_actions) { st.truncatedActions = actions.length; actions = actions.slice(0, opts.max_actions); }
    process.stderr.write(`exploring ${st.id} (${actions.length} controls)\n`);
    for (const a of actions) {
      const rec = { label: labelOf(a), role: a.role, step: a.step };
      st.actions.push(rec);
      if (a.external) { rec.skipped = 'external link'; continue; }
      if (avoided(a.name)) { rec.skipped = 'avoided (destructive or leaving)'; continue; }
      if (states.size >= opts.max_states) { rec.skipped = 'state limit reached'; limited = true; continue; }
      let ctx = null;
      try {
        let page;
        try { ({ ctx, page } = await open(st.start, st.steps)); } catch (e) { rec.error = `replay failed: ${e.message.split('\n')[0]}`; continue; }
        await runSetupAndSteps(page, { steps: [a.step] }, 'light');
        await settle(page);
        const fp = await pageFingerprint(page);
        if (fp.stateKey === st.stateKey) { rec.to = st.id; rec.effect = 'no visible change'; }
        else {
          const known = states.get(fp.stateKey);
          const to = known || await addState(page, fp, [...st.steps, a.step], st.depth + 1, st.start);
          rec.to = to.id;
          rec.effect = known ? 'known state' : 'new state';
          transitions.push({ from: st.id, to: to.id, label: rec.label });
        }
      } catch (e) {
        // The tap didn't go through (covered, still animating, timed out): a tooling failure,
        // not evidence that the control leads nowhere.
        rec.error = e.message.split('\n')[0];
      } finally {
        if (ctx) await ctx.close().catch(() => {});
      }
    }
  }
} catch (e) {
  failed = e;
} finally {
  await browser.close().catch(() => {});
}

const screens = save(!failed);
const replayFailed = ordered.filter((s) => s.unexplored === 'replay failed').length;
const tapFailed = ordered.reduce((n, s) => n + s.actions.filter((a) => a.error).length, 0);
console.log(`Crawl: ${ordered.length} states on ${screens.length} screens, ${transitions.length} transitions${limited ? ' (state limit reached)' : ''}${replayFailed ? `; ${replayFailed} state(s) could not be replayed` : ''}${tapFailed ? `; ${tapFailed} tap(s) failed` : ''}`);
console.log(`INVENTORY=${path.join(runDir, 'inventory.json')}`);
if (failed) { console.error(`Crawl stopped early, inventory kept: ${failed.message.split('\n')[0]}`); process.exit(1); }
