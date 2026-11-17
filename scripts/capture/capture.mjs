#!/usr/bin/env node
// Capture: renders every screen at phone sizes in light, dark and large-text variants,
// takes screenshots, collects layout data and runs axe-core. Writes <run>/manifest.json.
//
// Usage: node scripts/capture/capture.mjs [--config mockups.yaml] [--out <runDir>] [--only id,id] [--offline]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import {
  loadConfig, parseArgs, timestamp, writeJson, platformsFor, DEVICE_PRESETS,
} from '../lib/config.mjs';
import { expandMockup, imageSize } from '../lib/sources.mjs';
import { analyzePage } from '../lib/analyze-page.mjs';

const FRAME_ATTR = 'data-dc-frame';
const FRAME_CANVAS = { width: 1600, height: 1200 };
const LARGE_TEXT_CSS = 'html { font-size: 135% !important; }';
const FREEZE_CSS = '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; caret-color: transparent !important; }';
// Rules that only make sense for whole websites, or that our mobile checks replace.
const AXE_DISABLED = ['region', 'landmark-one-main', 'landmark-unique', 'landmark-complementary-is-top-level', 'page-has-heading-one', 'document-title', 'html-has-lang', 'bypass', 'meta-viewport', 'target-size'];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const args = parseArgs(process.argv.slice(2));
const cfg = loadConfig(args.config || 'mockups.yaml');
const runDir = path.resolve(args.out || path.join(cfg.output, timestamp()));
const only = args.only ? new Set(String(args.only).split(',')) : null;
fs.mkdirSync(runDir, { recursive: true });

const manifest = {
  version: 1,
  createdAt: new Date().toISOString(),
  config: cfg.configPath,
  baseDir: cfg.baseDir,
  product: existing(cfg.product),
  design: existing(cfg.design),
  references: cfg.references.filter((r) => fs.existsSync(r)),
  requires: cfg.requires,
  critics: cfg.critics,
  gate: cfg.gate,
  iterate: cfg.iterate,
  taste: [],
  devices: cfg.devices,
  variants: cfg.variants,
  screens: [],
  warnings: [],
};

function existing(p) { return p && fs.existsSync(p) ? p : null; }
const relRun = (p) => path.relative(runDir, p);

/** Which renders to make per platform. Each extra render costs time, so keep the set small. */
function renderPlan(frameMode) {
  const want = new Set(cfg.variants);
  const devices = frameMode ? ['frame'] : cfg.devices;
  const plan = [];
  for (const device of devices) {
    plan.push({ device, variant: 'light', axe: device === 'standard' || device === 'frame' });
    if (want.has('large-text') && (device === 'compact' || frameMode)) plan.push({ device, variant: 'large-text' });
  }
  const main = frameMode ? 'frame' : (devices.includes('standard') ? 'standard' : devices[0]);
  if (want.has('dark')) plan.push({ device: main, variant: 'dark', axe: true });
  if (want.has('large-text') && !frameMode && main !== 'compact') plan.push({ device: main, variant: 'large-text' });
  return plan;
}

async function launch() {
  const attempts = [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  let last;
  for (const opts of attempts) {
    try { return await chromium.launch(opts); } catch (e) { last = e; }
  }
  throw new Error(`Could not start a browser. Run: npx playwright install chromium\n${last?.message?.split('\n')[0]}`);
}

async function preparePage(context, url, variant, screen = {}) {
  const page = await context.newPage();
  if (args.offline) {
    await page.route('**/*', (route) => (route.request().url().startsWith('file:') || route.request().url().startsWith('data:') ? route.continue() : route.abort()));
  }
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await runSetupAndSteps(page, screen, variant);
  await injectStyles(page, variant);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(150);
  return page;
}

// Capture's own CSS (frozen animation, enlarged text). Added once per document, so it is
// re-added after a setup script or step reloads or navigates the page.
async function injectStyles(page, variant) {
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
async function evaluateAllowingNavigation(page, code) {
  try { await page.evaluate(`(async () => { ${code}\n })()`); }
  catch (e) { if (!navigated(e)) throw e; }
  await settle(page);
}

// Wait until the page has a loaded document that answers, riding out a reload in progress.
async function settle(page) {
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
async function runSetupAndSteps(page, screen, variant) {
  if (screen.setup) {
    try { await evaluateAllowingNavigation(page, fs.readFileSync(screen.setup, 'utf8')); }
    catch (e) { throw new Error(`setup ${path.basename(screen.setup)} failed: ${e.message.split('\n')[0]}`); }
  }
  if (screen.steps?.length) await injectStyles(page, variant);
  for (const [i, st] of (screen.steps || []).entries()) {
    const what = Object.entries(st).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ');
    try {
      if (st.click != null) await page.locator(st.click).first().click({ timeout: 5000 });
      else if (st.fill != null) await page.locator(st.fill).first().fill(String(st.value), { timeout: 5000 });
      else if (st.press != null) await page.keyboard.press(String(st.press));
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
  if (screen.steps?.length || screen.setup) await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
}

async function runAxe(page, frameIndex) {
  try {
    let builder = new AxeBuilder({ page }).withTags(AXE_TAGS).disableRules(AXE_DISABLED);
    if (frameIndex != null) builder = builder.include(`[${FRAME_ATTR}="${frameIndex}"]`);
    const res = await builder.analyze();
    return res.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, tags: v.tags,
      nodes: v.nodes.slice(0, 8).map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary || '').slice(0, 300), html: n.html.slice(0, 200) })),
      nodeCount: v.nodes.length,
    }));
  } catch (e) {
    manifest.warnings.push(`axe failed: ${e.message.split('\n')[0]}`);
    return null;
  }
}

async function captureHtml(browser, screen) {
  const url = pathToFileURL(screen.source).href;
  const frameMode = !!screen.phoneFrame;
  const out = [];

  // Frame mode: one page can hold several phone frames; each becomes its own screen.
  let frameCount = 1;
  if (frameMode) {
    const ctx = await browser.newContext({ viewport: FRAME_CANVAS, deviceScaleFactor: 1 });
    const page = await preparePage(ctx, url, 'light', screen);
    frameCount = await page.locator(screen.phoneFrame).count();
    await ctx.close();
    if (!frameCount) {
      manifest.warnings.push(`${screen.id}: phone_frame selector "${screen.phoneFrame}" matched nothing; captured the whole page instead.`);
      screen.phoneFrame = null;
      return captureHtml(browser, screen);
    }
  }

  const subScreens = frameMode && frameCount > 1
    ? Array.from({ length: frameCount }, (_, i) => ({ ...screen, id: `${screen.id}--frame-${i + 1}`, title: `${screen.title} (frame ${i + 1})`, frameIndex: i }))
    : [{ ...screen, frameIndex: frameMode ? 0 : null }];

  for (const sub of subScreens) {
    sub.captures = [];
    for (const platform of platformsFor(sub)) {
      for (const step of renderPlan(frameMode)) {
        const preset = step.device === 'frame'
          ? { name: 'Mockup frame', width: FRAME_CANVAS.width, height: FRAME_CANVAS.height, safeTop: DEVICE_PRESETS[platform].standard.safeTop, safeBottom: DEVICE_PRESETS[platform].standard.safeBottom }
          : DEVICE_PRESETS[platform][step.device];
        const ctx = await browser.newContext({
          viewport: { width: preset.width, height: preset.height },
          deviceScaleFactor: 2,
          colorScheme: step.variant === 'dark' ? 'dark' : 'light',
          hasTouch: true,
        });
        const page = await preparePage(ctx, url, step.variant, sub);
        const tag = `${sub.id}__${platform}-${step.device}__${step.variant}`;
        const shotPath = path.join(runDir, 'screenshots', `${tag}.png`);
        fs.mkdirSync(path.dirname(shotPath), { recursive: true });

        let frameAttr = null;
        if (frameMode) {
          await page.evaluate(({ sel, i, attr }) => {
            const el = document.querySelectorAll(sel)[i];
            el.setAttribute(attr, String(i));
            el.scrollIntoView({ block: 'start' });
          }, { sel: screen.phoneFrame, i: sub.frameIndex, attr: FRAME_ATTR });
          frameAttr = `${FRAME_ATTR}="${sub.frameIndex}"`;
          await page.locator(`[${frameAttr}]`).screenshot({ path: shotPath });
        } else {
          await page.screenshot({ path: shotPath });
        }

        const data = await page.evaluate(analyzePage, { frameAttr });
        let fullPath = null;
        if (!frameMode && data.scrollHeight > preset.height * 1.1) {
          fullPath = path.join(runDir, 'screenshots', `${tag}__full.png`);
          await page.screenshot({ path: fullPath, fullPage: true, clip: { x: 0, y: 0, width: preset.width, height: Math.min(data.scrollHeight, 5000) } });
        }
        const dataPath = path.join(runDir, 'data', `${tag}.json`);
        writeJson(dataPath, data);
        let axePath = null;
        if (step.axe) {
          const axe = await runAxe(page, frameMode ? sub.frameIndex : null);
          if (axe) { axePath = path.join(runDir, 'axe', `${tag}.json`); writeJson(axePath, axe); }
        }
        sub.captures.push({
          platform, device: step.device, deviceName: preset.name, variant: step.variant,
          viewport: data.viewport, safeTop: preset.safeTop, safeBottom: preset.safeBottom,
          screenshot: relRun(shotPath), fullPage: fullPath && relRun(fullPath),
          data: relRun(dataPath), axe: axePath && relRun(axePath),
        });
        await ctx.close();
      }
    }
    out.push(sub);
  }
  return out;
}

function captureImage(screen) {
  const ext = path.extname(screen.source).toLowerCase();
  const dest = path.join(runDir, 'screenshots', `${screen.id}__image${ext}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(screen.source, dest);
  const size = imageSize(screen.source);
  return [{
    ...screen,
    captures: [{ platform: screen.platform, device: 'image', deviceName: 'Static image', variant: 'as-provided', viewport: size, screenshot: relRun(dest) }],
  }];
}

const browser = await launch();
try {
  for (const mockup of cfg.mockups) {
    if (only && !only.has(mockup.id)) continue;
    const { screens, warnings } = expandMockup(mockup, runDir);
    manifest.warnings.push(...warnings);
    for (const screen of screens) {
      process.stderr.write(`capturing ${screen.id}\n`);
      try {
        const done = screen.kind === 'html' ? await captureHtml(browser, screen) : captureImage(screen);
        for (const s of done) {
          s.source = path.relative(cfg.baseDir, s.source);
          if (s.reference) s.reference = fs.existsSync(s.reference) ? s.reference : null;
          manifest.screens.push(s);
        }
      } catch (e) {
        manifest.warnings.push(`${screen.id}: capture failed: ${e.message.split('\n')[0]}`);
      }
    }
  }
} finally {
  await browser.close();
}

// Snapshot the frame and tokens the run was judged against, so old reports stay interpretable.
if (manifest.product) { fs.copyFileSync(manifest.product, path.join(runDir, 'framing.md')); manifest.framingSnapshot = 'framing.md'; }
else manifest.warnings.push('No PRODUCT.md: run the frame skill first so the critique can judge task fit.');
if (manifest.design) { fs.copyFileSync(manifest.design, path.join(runDir, 'DESIGN.md')); manifest.designSnapshot = 'DESIGN.md'; }

// The references you chose for the direction (taste), copied so critics read them inside the run.
if (cfg.taste.length) {
  fs.mkdirSync(path.join(runDir, 'taste'), { recursive: true });
  cfg.taste.forEach((src, i) => {
    const name = `${String(i + 1).padStart(2, '0')}-${path.basename(src)}`;
    fs.copyFileSync(src, path.join(runDir, 'taste', name));
    manifest.taste.push(`taste/${name}`);
  });
}
writeJson(path.join(runDir, 'manifest.json'), manifest);
for (const w of manifest.warnings) process.stderr.write(`warning: ${w}\n`);
const captures = manifest.screens.reduce((n, s) => n + s.captures.length, 0);
console.log(`Captured ${manifest.screens.length} screens (${captures} renders)`);
console.log(`RUN_DIR=${runDir}`);
if (!manifest.screens.length) process.exit(1);
