// Browser plumbing shared by capture, journeys and the crawler: launching Chromium, loading a
// page with capture's CSS and the device's safe-area insets, running a mockup's setup script and
// steps, and fingerprinting the state a page is in.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { installPageHelpers } from './page-helpers.mjs';

export const LARGE_TEXT_CSS = 'html { font-size: 135% !important; }';
export const FREEZE_CSS = '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; caret-color: transparent !important; }';

/** True when the browser itself died (a crash), so every later page would fail too. */
export const browserGone = (e) => /Target page, context or browser has been closed|Browser has been closed|browser has disconnected|Target closed/i.test(e?.message || '');

export async function launch() {
  const attempts = [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  let last;
  for (const opts of attempts) {
    try { return await chromium.launch(opts); } catch (e) { last = e; }
  }
  throw new Error(`Could not start a browser. Run: npx playwright install chromium\n${last?.message?.split('\n')[0]}`);
}

export async function preparePage(context, url, variant, screen = {}, insets = null, { offline = false } = {}) {
  const page = await context.newPage();
  await installPageHelpers(page);
  if (offline) {
    await page.route('**/*', (route) => (route.request().url().startsWith('file:') || route.request().url().startsWith('data:') ? route.continue() : route.abort()));
  }
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  if (insets) page.dcInsets = await emulateSafeArea(page, insets);
  await runSetupAndSteps(page, screen, variant);
  await injectStyles(page, variant);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(150);
  await settleAnimations(page);
  return page;
}

// Wait for running page transitions and animations (Web Animations, which capture's frozen CSS
// doesn't stop: app frameworks drive their page and sheet transitions with element.animate()),
// then two animation frames, so a screenshot doesn't catch a page half-way in. Endless
// animations (spinners) are ignored; finite ones still running at the timeout are finished.
export async function settleAnimations(page, { timeout = 2000 } = {}) {
  await page.evaluate(async (ms) => {
    const finite = () => (document.getAnimations ? document.getAnimations() : []).filter((a) => {
      if (a.playState !== 'running' && a.playState !== 'pending') return false;
      const end = a.effect?.getComputedTiming?.().endTime;
      return Number.isFinite(end);
    });
    const deadline = Date.now() + ms;
    let running = finite();
    while (running.length && Date.now() < deadline) {
      await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 100))]);
      running = finite();
    }
    for (const a of running) { try { a.finish(); } catch { /* infinite or detached */ } }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, timeout).catch(() => {});
}

// The device's system-bar insets for env(safe-area-inset-*). As on iOS and Android, a page gets
// them only with viewport-fit=cover; without it env() stays 0. Chromium's DevTools protocol
// sets them (Emulation.setSafeAreaInsetsOverride); older browsers fall back to 0 with a note.
export async function emulateSafeArea(page, { top, bottom }) {
  const cover = await page.evaluate(() => /viewport-fit\s*=\s*cover/i.test(document.querySelector('meta[name=viewport]')?.content || ''));
  if (!cover) return { applied: false, reason: 'no viewport-fit=cover' };
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom, left: 0, right: 0 } });
    return { applied: true, top, bottom };
  } catch (e) {
    return { applied: false, reason: `browser can't emulate insets (${e.message.split('\n')[0]})` };
  }
}

// Capture's own CSS (frozen animation, enlarged text). Added once per document, so it is
// re-added after a setup script or step reloads or navigates the page.
export async function injectStyles(page, variant) {
  await settle(page);
  await page.evaluate(({ freeze, large }) => {
    if (document.getElementById('dc-capture-styles')) return;
    const el = document.createElement('style');
    el.id = 'dc-capture-styles';
    el.textContent = freeze + (large || '');
    (document.head || document.documentElement).appendChild(el);
  }, { freeze: FREEZE_CSS, large: variant === 'large-text' ? LARGE_TEXT_CSS : '' });
}

const navigated = (e) => /context was destroyed|navigat/i.test(e?.message || '');

// Run code in the page; a reload or navigation it causes (seed storage, then reload) is fine.
export async function evaluateAllowingNavigation(page, code) {
  try { await page.evaluate(`(async () => { ${code}\n })()`); }
  catch (e) { if (!navigated(e)) throw e; }
  await settle(page);
}

// Wait until the page has a loaded document that answers, riding out a reload in progress.
export async function settle(page) {
  for (let i = 0; i < 50; i++) {
    try {
      await page.waitForLoadState('load', { timeout: 15000 });
      if (await page.evaluate(() => document.readyState === 'complete')) break;
    } catch (e) { if (!navigated(e)) throw e; }
    await page.waitForTimeout(100);
  }
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
}

// Bring a single-page app to the screen: the mockup's setup script, then its steps (mockups.yaml).
export async function runSetupAndSteps(page, screen, variant) {
  if (screen.setup) {
    try { await evaluateAllowingNavigation(page, fs.readFileSync(screen.setup, 'utf8')); }
    catch (e) { throw new Error(`setup ${path.basename(screen.setup)} failed: ${e.message.split('\n')[0]}`); }
  }
  if (screen.steps?.length) await injectStyles(page, variant);
  for (const [i, st] of (screen.steps || []).entries()) {
    const what = Object.entries(st).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ');
    try {
      // The first step waits longer: a single-page app may not have rendered yet.
      if (st.tap != null) await tapByName(page, String(st.tap), { timeout: i === 0 ? 10000 : 5000 });
      else if (st.click != null) await page.locator(st.click).first().click({ timeout: 5000 });
      else if (st.fill != null) await page.locator(st.fill).first().fill(String(st.value), { timeout: 5000 });
      else if (st.press != null) await page.keyboard.press(String(st.press));
      else if (st.network != null) await setNetwork(page, String(st.network));
      else if (st.scroll != null) await page.locator(st.scroll).first().scrollIntoViewIfNeeded({ timeout: 5000 });
      else if (st.goto != null) {
        const target = new URL(String(st.goto), page.url()).href;
        await page.evaluate((u) => { if (u.split('#')[0] === location.href.split('#')[0]) location.hash = new URL(u).hash; else location.href = u; }, target);
        await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
      } else if (st.eval != null) await evaluateAllowingNavigation(page, st.eval);
      else if (st.wait != null) {
        if (typeof st.wait === 'number') await page.waitForTimeout(st.wait);
        else await page.locator(String(st.wait)).first().waitFor({ state: 'visible', timeout: 10000 });
      }
    } catch (e) {
      throw new Error(`step ${i + 1} (${what}) failed: ${e.message.split('\n')[0]}`);
    }
    await page.waitForTimeout(50);
    await injectStyles(page, variant);
  }
  if (screen.steps?.length || screen.setup) {
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await settleAnimations(page);
  }
}


// A `network:` step puts the app's own requests into a condition, so its error, offline and
// loading states can be captured as they really are: offline (no connection), fail (requests
// answer 500), slow (each waits three seconds), online (back to normal). The page's own
// document and files loaded before the step are untouched.
async function setNetwork(page, mode) {
  const ctx = page.context();
  await ctx.setOffline(false);
  await page.unroute('**/*', page.dcNetwork).catch(() => {});
  page.dcNetwork = null;
  if (mode === 'online') return;
  if (mode === 'offline') { await ctx.setOffline(true); return; }
  if (mode !== 'fail' && mode !== 'slow') throw new Error(`network: must be offline, fail, slow or online (got ${mode})`);
  page.dcNetwork = async (route) => {
    if (!['fetch', 'xhr'].includes(route.request().resourceType())) return route.continue();
    if (mode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    await new Promise((r) => setTimeout(r, 3000));
    return route.continue();
  };
  await page.route('**/*', page.dcNetwork);
}

// ---------- taps by accessible name ----------
const TAP_ROLES = ['button', 'link', 'tab', 'menuitem', 'option', 'switch', 'checkbox', 'radio', 'treeitem'];

/**
 * Tap the first visible control whose accessible name is `name` (exact, then partial), else
 * matching text. Like Playwright's own locators, it retries until `timeout` (a sheet still sliding
 * in, an app not rendered yet) and scrolls the control into view (below the fold, inside a
 * scrolling container) before tapping.
 */
export async function tapByName(page, name, { timeout = 5000 } = {}) {
  const tries = [];
  for (const exact of [true, false]) {
    for (const role of TAP_ROLES) tries.push(page.getByRole(role, { name, exact }));
    tries.push(page.getByText(name, { exact }));
  }
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const loc of tries) {
      const n = await loc.count().catch(() => 0);
      for (let i = 0; i < Math.min(n, 5); i++) {
        const el = loc.nth(i);
        if (!(await el.isVisible().catch(() => false))) continue;
        await el.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
        await el.click({ timeout: Math.max(1000, deadline - Date.now()) });
        return;
      }
    }
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(200);
  }
  throw new Error(`nothing visible named "${name}" to tap`);
}

// ---------- state fingerprints (accessibility snapshot) ----------
// Two levels, after DroidBot's content-free and full state IDs (Li et al., device_state.py) and
// Crawljax's stripped-DOM comparison (Mesbah et al.): a screen key from the page's structure
// (headings, dialogs, selected tabs) and a state key from the whole snapshot with volatile values
// (numbers, long text) stripped.
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const normLine = (l) => l.replace(/\d+([.,:]\d+)*/g, '#').replace(/"([^"]{50})[^"]*"/g, '"$1…"').replace(/: (.{50}).*$/, ': $1…').trimEnd();

export function fingerprintFromSnapshot(snapshot, docTitle = '') {
  const lines = String(snapshot || '').split('\n').filter((l) => l.trim());
  const norm = lines.map(normLine);
  const stateKey = sha(norm.join('\n'));
  const dialog = lines.find((l) => /- (dialog|alertdialog)\b/.test(l));
  const headings = lines.filter((l) => /- heading "/.test(l) && /\[level=[12]\]/.test(l)).map((l) => l.match(/heading "([^"]*)"/)[1]);
  const selected = lines.filter((l) => /\[(selected|current[^\]]*)\]/.test(l)).map((l) => (l.match(/"([^"]*)"/) || [])[1]).filter(Boolean);
  const structural = [dialog ? 'dialog' : '', ...headings.map((h) => `h:${h.replace(/\d+/g, '#')}`), ...selected.map((s) => `sel:${s}`)].filter(Boolean);
  const fallback = lines.filter((l) => /- (button|link|tab|textbox|switch|checkbox|navigation)\b/.test(l)).map((l) => l.replace(/:.*$/, '').replace(/\d+/g, '#').trim());
  const screenKey = sha((structural.length ? structural : fallback).join('\n'));
  const dialogName = dialog && (dialog.match(/"([^"]*)"/) || [])[1];
  const title = dialogName || headings[0] || docTitle || 'Untitled';
  return { stateKey, screenKey, title, kind: dialog ? 'sheet' : 'screen' };
}

export async function pageFingerprint(page) {
  const snapshot = await page.locator('body').ariaSnapshot({ timeout: 5000 }).catch(() => '');
  const fp = fingerprintFromSnapshot(snapshot, await page.title().catch(() => ''));
  // Name the state after what is on top (an open sheet, the page pushed last), not the first
  // heading in the document, which in a stacked or tabbed app is often the page underneath.
  const top = await page.evaluate(topLayerTitle).catch(() => null);
  return { ...fp, title: top || fp.title, snapshot };
}

// Runs in the page. The name or first heading of the layer on top: an open dialog or sheet under
// the viewport, else the page under the upper middle of the viewport. Walks open shadow roots.
export function topLayerTitle() {
  const W = innerWidth; const H = innerHeight;
  const { up, within, deepHit } = window.__dc;
  const shown = (el) => window.__dc.shown(el) && parseFloat(getComputedStyle(el).opacity) > 0;
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const uncovered = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2; const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > W || y > H) return true;
    const hit = deepHit(x, y);
    return !hit || within(hit, el) || within(el, hit);
  };
  const firstHeading = (layer) => {
    for (const h of layer.querySelectorAll('h1,h2,h3,[role=heading]')) if (shown(h) && uncovered(h) && clean(h.textContent)) return clean(h.textContent);
    return null;
  };
  const DIALOG = 'dialog,[role=dialog],[role=alertdialog],[aria-modal=true]';
  for (const [x, y] of [[W / 2, H * 0.8], [W / 2, H * 0.5], [W / 2, H * 0.25]]) {
    for (let e = deepHit(x, y); e; e = up(e)) {
      if (e.matches?.(DIALOG)) {
        const label = e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
        return clean(label) || firstHeading(e);
      }
    }
  }
  for (let e = deepHit(W / 2, H * 0.35); e && e !== document.body && e !== document.documentElement; e = up(e)) {
    const h = firstHeading(e);
    if (h) return h;
  }
  return null;
}
