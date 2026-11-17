#!/usr/bin/env node
// Capture: renders every screen at phone sizes in light, dark and large-text variants,
// takes screenshots, collects layout data and runs axe-core. Writes <run>/manifest.json.
//
// Usage: node scripts/capture/capture.mjs [--config mockups.yaml] [--out <runDir>] [--only id,id] [--offline]
import fs from 'node:fs';
import path from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import {
  loadConfig, parseArgs, timestamp, writeJson, platformsFor, DEVICE_PRESETS, isRemote, pageUrl,
} from '../lib/config.mjs';
import { expandMockup, imageSize } from '../lib/sources.mjs';
import { analyzePage } from '../lib/analyze-page.mjs';
import { launch, preparePage, pageFingerprint } from '../lib/browser.mjs';

const FRAME_ATTR = 'data-dc-frame';
const FRAME_CANVAS = { width: 1600, height: 1200 };
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
  content: existing(cfg.content),
  references: cfg.references.filter((r) => fs.existsSync(r)),
  requires: cfg.requires,
  critics: cfg.critics,
  language: cfg.language,
  vocabulary: cfg.vocabulary,
  gate: cfg.gate,
  platform: cfg.platform,
  source: cfg.source.map((p) => path.relative(cfg.baseDir, p)),
  iterate: cfg.iterate,
  taste: [],
  devices: cfg.devices,
  variants: cfg.variants,
  screens: [],
  pageLanguages: [],
  warnings: [],
};

// Paths in the manifest are relative to the config; URLs stay as they are.
function relSource(s) {
  if (!isRemote(s.source)) s.source = path.relative(cfg.baseDir, s.source);
  s.sourceFiles = (s.sourceFiles || []).map((p) => path.relative(cfg.baseDir, p));
}

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
  const url = pageUrl(screen.source);
  // --offline keeps local mockups from reaching the network; a served PWA needs it.
  const offline = args.offline && !isRemote(screen.source);
  const frameMode = !!screen.phoneFrame;
  const out = [];

  // Frame mode: one page can hold several phone frames; each becomes its own screen.
  let frameCount = 1;
  if (frameMode) {
    const ctx = await browser.newContext({ viewport: FRAME_CANVAS, deviceScaleFactor: 1 });
    const page = await preparePage(ctx, url, 'light', screen, null, { offline });
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
        const page = await preparePage(ctx, url, step.variant, sub, frameMode ? null : { top: preset.safeTop, bottom: preset.safeBottom }, { offline });
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
        data.insets = page.dcInsets || null;
        if (!frameMode) data.fingerprint = await pageFingerprint(page);
        if (data.lang && !manifest.pageLanguages.includes(data.lang)) manifest.pageLanguages.push(data.lang);
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
          relSource(s);
          if (s.reference) s.reference = fs.existsSync(s.reference) ? s.reference : null;
          manifest.screens.push(s);
        }
      } catch (e) {
        manifest.warnings.push(`${screen.id}: capture failed: ${e.message.split('\n')[0]}`);
      }
    }
  }

  // Journeys (mockups.yaml journeys:): replay the taps from the start mockup and capture every step.
  // A tap that can't be found ends the journey there; the report treats it as a broken journey.
  manifest.journeys = [];
  for (const j of cfg.journeys) {
    if (only && !only.has(j.id)) continue;
    const startMockup = cfg.mockups.find((m) => m.id === j.start);
    const page0 = expandMockup(startMockup, runDir).screens.find((sc) => (j.state ? sc.state === j.state : true));
    if (!page0 || page0.kind !== 'html') { manifest.warnings.push(`journey ${j.id}: start ${j.start}${j.state ? `/${j.state}` : ''} is not an HTML page; skipped`); continue; }
    const record = { id: j.id, title: j.title, critical: j.critical, stage: j.stage, ends_at: j.ends_at, notes: j.notes, start: j.start, steps: j.steps.map(stepLabel), screens: [], brokenAt: null, error: null };
    for (let k = 0; k <= j.steps.length; k++) {
      const screen = {
        ...page0,
        id: `journey--${j.id}--${k}`,
        title: `${j.title} ${k}/${j.steps.length}: ${k ? stepLabel(j.steps[k - 1]) : 'start'}`,
        steps: [...(page0.steps || []), ...j.steps.slice(0, k)],
        flow: `journey:${j.id}`, step: k + 1, state: null,
        journey: j.id, journeyStep: k, journeyAction: k ? stepLabel(j.steps[k - 1]) : null,
        notes: `Journey "${j.title}"${j.critical ? ' (must not fail)' : ''}, step ${k} of ${j.steps.length}${k ? `, after tapping "${stepLabel(j.steps[k - 1])}"` : ''}.`,
      };
      process.stderr.write(`capturing ${screen.id}\n`);
      try {
        for (const s of await captureHtml(browser, screen)) { relSource(s); manifest.screens.push(s); }
        record.screens.push(screen.id);
      } catch (e) {
        record.brokenAt = k;
        record.error = e.message.split('\n')[0];
        manifest.warnings.push(`journey ${j.id} broke at step ${k} ("${stepLabel(j.steps[k - 1])}"): ${record.error}`);
        break;
      }
    }
    manifest.journeys.push(record);
  }

  // States found by the crawler (scripts/crawl/crawl.mjs): each becomes a screen reached by its path.
  if (args.inventory) {
    const inv = JSON.parse(fs.readFileSync(path.resolve(args.inventory), 'utf8'));
    const startMockup = cfg.mockups.find((m) => m.id === inv.start) || cfg.mockups[0];
    const page0 = expandMockup(startMockup, runDir).screens[0];
    manifest.inventory = path.relative(runDir, path.resolve(args.inventory));
    for (const st of inv.states) {
      const screen = { ...page0, id: `crawl--${st.id}`, title: st.title, steps: [...(page0.steps || []), ...st.steps], flow: 'crawl', step: null, state: null, inventoryState: st.id, notes: `Found by the crawler at depth ${st.depth}${st.steps.length ? ` (${st.steps.map(stepLabel).join(' → ')})` : ''}.` };
      process.stderr.write(`capturing ${screen.id}\n`);
      try { for (const s of await captureHtml(browser, screen)) { relSource(s); manifest.screens.push(s); } }
      catch (e) { manifest.warnings.push(`${screen.id}: capture failed: ${e.message.split('\n')[0]}`); }
    }
  }
} finally {
  await browser.close();
}

function stepLabel(st) {
  if (typeof st === 'string') return st;
  const [k, v] = Object.entries(st).find(([key]) => key !== 'value') || ['', ''];
  return k === 'tap' ? String(v) : `${k} ${v}`;
}

// Snapshot the frame and tokens the run was judged against, so old reports stay interpretable.
if (manifest.product) { fs.copyFileSync(manifest.product, path.join(runDir, 'framing.md')); manifest.framingSnapshot = 'framing.md'; }
else manifest.warnings.push('No PRODUCT.md: run the frame skill first so the critique can judge task fit.');
if (manifest.design) { fs.copyFileSync(manifest.design, path.join(runDir, 'DESIGN.md')); manifest.designSnapshot = 'DESIGN.md'; }
if (manifest.content) { fs.copyFileSync(manifest.content, path.join(runDir, 'content.md')); manifest.contentSnapshot = 'content.md'; }

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
