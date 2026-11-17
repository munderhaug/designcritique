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
// Usage: node scripts/crawl/crawl.mjs --config mockups.yaml --out <RUN_DIR> [--max-states 60] [--offline]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, parseArgs, writeJson, timestamp, slug, DEVICE_PRESETS } from '../lib/config.mjs';
import { expandMockup } from '../lib/sources.mjs';
import { launch, preparePage, pageFingerprint, settle, runSetupAndSteps } from '../lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const cfg = loadConfig(args.config || 'mockups.yaml');
const runDir = path.resolve(args.out || path.join(cfg.output, timestamp()));
const opts = { ...(cfg.crawl || { start: cfg.mockups[0].id, max_states: 60, max_actions: 40, max_depth: 8, avoid: [], fill: {} }) };
if (args['max-states']) opts.max_states = Number(args['max-states']);

// Controls the crawler never presses: destructive, paying, signing out, leaving.
const AVOID = /\b(delete|remove|erase|slett|fjern|log ?out|logg ut|sign ?out|reset|tilbakestill|nullstill|pay|betal|buy|kjøp|purchase|unsubscribe|avslutt abonnement)\b/i;
const avoided = (name) => AVOID.test(name) || opts.avoid.some((a) => name.toLowerCase().includes(a.toLowerCase()));

const startMockup = cfg.mockups.find((m) => m.id === opts.start);
const page0 = expandMockup(startMockup, runDir).screens[0];
if (!page0 || page0.kind !== 'html') { console.error(`crawl.start ${opts.start} must be an HTML page`); process.exit(2); }
const url = pathToFileURL(page0.source).href;
const preset = DEVICE_PRESETS[page0.platform === 'android' ? 'android' : 'ios'].standard;
fs.mkdirSync(path.join(runDir, 'crawl'), { recursive: true });

const browser = await launch();
async function open(steps) {
  const ctx = await browser.newContext({ viewport: { width: preset.width, height: preset.height }, deviceScaleFactor: 1, hasTouch: true, colorScheme: 'light' });
  ctx.on('page', (p) => { if (p !== ctx.pages()[0]) p.close().catch(() => {}); });
  const page = await preparePage(ctx, url, 'light', { ...page0, steps: [...(page0.steps || []), ...steps] }, { top: preset.safeTop, bottom: preset.safeBottom }, { offline: args.offline });
  for (const [selector, value] of Object.entries(opts.fill)) {
    const el = page.locator(selector).first();
    if (await el.isVisible().catch(() => false) && !(await el.inputValue().catch(() => ''))) await el.fill(String(value)).catch(() => {});
  }
  return { ctx, page };
}

// Visible, enabled controls with a name and a replayable step (tap by name when unique, else a CSS path).
async function listActions(page) {
  return page.evaluate(() => {
    const SEL = 'a[href],button,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=switch],[role=checkbox],[role=radio],input[type=checkbox],input[type=radio],select';
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden],[aria-hidden=true],[inert]'); };
    const nameOf = (el) => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim() || (el.labels?.[0]?.textContent) || el.innerText || el.getAttribute('title') || el.querySelector('img[alt]')?.getAttribute('alt') || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const cssPath = (el) => {
      if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
      const parts = [];
      for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
        const sibs = [...(e.parentElement?.children || [])].filter((x) => x.tagName === e.tagName);
        parts.unshift(`${e.tagName.toLowerCase()}${sibs.length > 1 ? `:nth-of-type(${sibs.indexOf(e) + 1})` : ''}`);
      }
      return `body > ${parts.join(' > ')}`;
    };
    const out = [];
    for (const el of document.querySelectorAll(SEL)) {
      if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      const href = el.getAttribute('href');
      let external = false;
      if (href) {
        try { const u = new URL(href, location.href); external = /^(mailto|tel|sms):/.test(u.protocol) || (u.protocol !== location.protocol || u.host !== location.host) || el.target === '_blank'; } catch { external = true; }
      }
      out.push({ name: nameOf(el), role: el.getAttribute('role') || el.tagName.toLowerCase(), selector: cssPath(el), external });
    }
    const counts = {};
    for (const a of out) counts[a.name] = (counts[a.name] || 0) + 1;
    return out.map((a) => ({ ...a, step: a.name && counts[a.name] === 1 ? { tap: a.name } : { click: a.selector } }));
  });
}

const states = new Map(); // stateKey -> state
const ordered = [];
const transitions = [];
let limited = false;
const addState = async (page, fp, steps, depth) => {
  const id = `s${String(ordered.length + 1).padStart(2, '0')}-${slug(fp.title).slice(0, 30)}`;
  const shot = path.join(runDir, 'crawl', `${id}.png`);
  await page.screenshot({ path: shot }).catch(() => {});
  const st = { id, title: fp.title, kind: fp.kind, screenKey: fp.screenKey, stateKey: fp.stateKey, depth, steps, screenshot: path.relative(runDir, shot), actions: [] };
  states.set(fp.stateKey, st);
  ordered.push(st);
  return st;
};

try {
  {
    const { ctx, page } = await open([]);
    await addState(page, await pageFingerprint(page), [], 0);
    await ctx.close();
  }
  for (let qi = 0; qi < ordered.length; qi++) {
    const st = ordered[qi];
    if (st.depth >= opts.max_depth) { st.unexplored = 'max depth'; continue; }
    let actions;
    { const { ctx, page } = await open(st.steps); actions = await listActions(page); await ctx.close(); }
    if (actions.length > opts.max_actions) { st.truncatedActions = actions.length; actions = actions.slice(0, opts.max_actions); }
    process.stderr.write(`exploring ${st.id} (${actions.length} controls)\n`);
    for (const a of actions) {
      const rec = { label: a.name || a.selector, role: a.role, step: a.step };
      st.actions.push(rec);
      if (a.external) { rec.skipped = 'external link'; continue; }
      if (avoided(a.name)) { rec.skipped = 'avoided (destructive or leaving)'; continue; }
      if (states.size >= opts.max_states) { rec.skipped = 'state limit reached'; limited = true; continue; }
      const { ctx, page } = await open(st.steps);
      try {
        await runSetupAndSteps(page, { steps: [a.step] }, 'light');
        await settle(page);
        const fp = await pageFingerprint(page);
        if (fp.stateKey === st.stateKey) { rec.to = st.id; rec.effect = 'no visible change'; }
        else {
          const known = states.get(fp.stateKey);
          const to = known || await addState(page, fp, [...st.steps, a.step], st.depth + 1);
          rec.to = to.id;
          rec.effect = known ? 'known state' : 'new state';
          transitions.push({ from: st.id, to: to.id, label: rec.label });
        }
      } catch (e) {
        rec.error = e.message.split('\n')[0];
      } finally {
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}

const screens = [];
for (const st of ordered) {
  let sc = screens.find((x) => x.screenKey === st.screenKey);
  if (!sc) { sc = { screenKey: st.screenKey, title: st.title, kind: st.kind, states: [] }; screens.push(sc); }
  sc.states.push(st.id);
}
const inventory = {
  generatedAt: new Date().toISOString(),
  start: opts.start,
  device: preset.name,
  limits: { max_states: opts.max_states, max_actions: opts.max_actions, max_depth: opts.max_depth, reached: limited },
  method: 'Event-driven state-flow crawl (Crawljax) with accessibility-snapshot state IDs (DroidBot-style screen and state keys)',
  states: ordered,
  screens,
  transitions,
};
writeJson(path.join(runDir, 'inventory.json'), inventory);
console.log(`Crawl: ${ordered.length} states on ${screens.length} screens, ${transitions.length} transitions${limited ? ' (state limit reached)' : ''}`);
console.log(`INVENTORY=${path.join(runDir, 'inventory.json')}`);
