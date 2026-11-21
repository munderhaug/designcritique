#!/usr/bin/env node
// Capture: renders every screen at phone sizes in light, dark and large-text variants,
// takes screenshots, collects layout data and runs axe-core. Writes <run>/manifest.json.
//
// Usage: node scripts/capture/capture.mjs [--config mockups.yaml] [--out <runDir>] [--offline]
//          [--inventory <run>/inventory.json] [--only id,id] [--journeys id,id] [--resume]
//
// --only     capture just these: mockup, screen, journey or crawl state ids (s17-x or crawl--s17-x)
// --journeys capture just these journeys
// --resume   keep the screens already in <runDir>/manifest.json and capture the rest
// --frame-only  capture nothing; copy PRODUCT.md, DESIGN.md and the content guide into the run
//               again (after the frame was changed, so the critics judge against the new one)
// With --only or --journeys into a run that has a manifest, the new captures replace the old
// ones with the same id and everything else is kept. The manifest is written after every
// screen, so a run stopped by a time limit or a crash keeps what it captured.
import fs from 'node:fs';
import path from 'node:path';
import { unfilledSections, unfilledMessage } from '../lib/framing.mjs';
import { AxeBuilder } from '@axe-core/playwright';
import {
  loadConfig, parseArgs, timestamp, writeJson, platformsFor, DEVICE_PRESETS, isRemote, pageUrl,
} from '../lib/config.mjs';
import { expandMockup, imageSize } from '../lib/sources.mjs';
import { analyzePage } from '../lib/analyze-page.mjs';
import { launch, preparePage, pageFingerprint, browserGone } from '../lib/browser.mjs';

const FRAME_ATTR = 'data-dc-frame';
const FRAME_CANVAS = { width: 1600, height: 1200 };
// Rules that only make sense for whole websites, or that our mobile checks replace.
const AXE_DISABLED = ['region', 'landmark-one-main', 'landmark-unique', 'landmark-complementary-is-top-level', 'page-has-heading-one', 'document-title', 'html-has-lang', 'bypass', 'meta-viewport', 'target-size'];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const args = parseArgs(process.argv.slice(2));
const cfg = loadConfig(args.config || 'mockups.yaml');
const runDir = path.resolve(args.out || path.join(cfg.output, timestamp()));
const listArg = (v) => (v ? new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean)) : null);
const frameOnly = !!args['frame-only'];
const only = frameOnly ? new Set(['(nothing)']) : listArg(args.only);
const onlyJourneys = listArg(args.journeys);
const resume = !!args.resume;
fs.mkdirSync(runDir, { recursive: true });
const manifestPath = path.join(runDir, 'manifest.json');
// A subset or a resume adds to the run's manifest instead of starting a new one.
if (frameOnly && !fs.existsSync(manifestPath)) { console.error('--frame-only needs a run that was already captured (--out <runDir>)'); process.exit(2); }
const previous = (only || onlyJourneys || resume) && fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;

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
  complete: false,
};
if (previous) {
  manifest.screens = previous.screens || [];
  manifest.journeys = previous.journeys || [];
  manifest.pageLanguages = previous.pageLanguages || [];
  if (previous.inventory) manifest.inventory = previous.inventory;
}

// What this invocation captures. A crawl state matches its own id or crawl--<id>.
const wanted = (...ids) => {
  if (onlyJourneys && !only) return false;
  return !only || ids.some((id) => id && only.has(id));
};
const wantedJourney = (id) => !frameOnly && (onlyJourneys ? onlyJourneys.has(id) : !only || only.has(id));
const done = (id) => resume && manifest.screens.some((s) => s.id === id || s.id.startsWith(`${id}--frame-`));
// Put a screen in the manifest: in place of an earlier capture with the same id, else at the end.
function putScreen(s) {
  const i = manifest.screens.findIndex((x) => x.id === s.id);
  if (i >= 0) manifest.screens[i] = s; else manifest.screens.push(s);
}
function writeManifest() { writeJson(manifestPath, manifest); }

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
        try {
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
        // The DOM as reached by steps, for the detectors, which can only load a page as it starts.
        let domPath = null;
        const mainDevice = cfg.devices.includes('standard') ? 'standard' : cfg.devices[0];
        if (!frameMode && step.device === mainDevice && step.variant === 'light' && (sub.steps?.length || sub.setup)) {
          domPath = path.join(runDir, 'dom', `${sub.id}__${platform}.html`);
          fs.mkdirSync(path.dirname(domPath), { recursive: true });
          fs.writeFileSync(domPath, await page.evaluate(domSnapshot).catch(() => ''));
          if (!fs.statSync(domPath).size) { fs.rmSync(domPath); domPath = null; }
        }
        let axePath = null;
        if (step.axe) {
          const axe = await runAxe(page, frameMode ? sub.frameIndex : null);
          if (axe) { axePath = path.join(runDir, 'axe', `${tag}.json`); writeJson(axePath, axe); }
        }
        sub.captures.push({
          platform, device: step.device, deviceName: preset.name, variant: step.variant,
          viewport: data.viewport, safeTop: preset.safeTop, safeBottom: preset.safeBottom,
          screenshot: relRun(shotPath), fullPage: fullPath && relRun(fullPath),
          data: relRun(dataPath), axe: axePath && relRun(axePath), dom: domPath && relRun(domPath),
        });
        } finally { await ctx.close().catch(() => {}); }
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

let browser = await launch();
// A crashed browser fails every later screen ("Target page, context or browser has been closed"):
// start a new one and capture the screen once more.
async function captureWithRelaunch(screen) {
  try { return await captureHtml(browser, screen); } catch (e) {
    if (!browserGone(e)) throw e;
    process.stderr.write(`browser closed during ${screen.id}; relaunching\n`);
    await browser.close().catch(() => {});
    browser = await launch();
    return captureHtml(browser, screen);
  }
}

// Journey steps are the user's actions. A `wait` step belongs to the action before it (or to
// the start), so it is never captured or counted as a step of its own.
function journeyActions(steps) {
  const groups = [[]];
  for (const st of steps) {
    if (st.wait != null) groups[groups.length - 1].push(st);
    else groups.push([st]);
  }
  return groups;
}

try {
  for (const mockup of cfg.mockups) {
    const { screens, warnings } = expandMockup(mockup, runDir);
    if (!screens.some((sc) => wanted(mockup.id, sc.id))) continue;
    manifest.warnings.push(...warnings);
    for (const screen of screens) {
      if (!wanted(mockup.id, screen.id) || done(screen.id)) continue;
      process.stderr.write(`capturing ${screen.id}\n`);
      try {
        const got = screen.kind === 'html' ? await captureWithRelaunch(screen) : captureImage(screen);
        for (const s of got) {
          relSource(s);
          if (s.reference) s.reference = fs.existsSync(s.reference) ? s.reference : null;
          putScreen(s);
        }
      } catch (e) {
        manifest.warnings.push(`${screen.id}: capture failed: ${e.message.split('\n')[0]}`);
      }
      writeManifest();
    }
  }

  // Journeys (mockups.yaml journeys:): replay the taps from the start mockup and capture every step.
  // A tap that can't be found ends the journey there; the report treats it as a broken journey.
  manifest.journeys = manifest.journeys || [];
  for (const j of cfg.journeys) {
    if (!wantedJourney(j.id)) continue;
    const prev = manifest.journeys.find((r) => r.id === j.id);
    if (resume && prev && prev.brokenAt == null && prev.screens.every((id) => manifest.screens.some((s) => s.id === id))) continue;
    const startMockup = cfg.mockups.find((m) => m.id === j.start);
    const page0 = expandMockup(startMockup, runDir).screens.find((sc) => (j.state ? sc.state === j.state : true));
    if (!page0 || page0.kind !== 'html') { manifest.warnings.push(`journey ${j.id}: start ${j.start}${j.state ? `/${j.state}` : ''} is not an HTML page; skipped`); continue; }
    const groups = journeyActions(j.steps);
    const actions = groups.slice(1).map((g) => g[0]);
    const record = { id: j.id, title: j.title, critical: j.critical, stage: j.stage, ends_at: j.ends_at, notes: j.notes, start: j.start, steps: actions.map(stepLabel), screens: [], brokenAt: null, error: null };
    // A recapture replaces the journey's earlier screens.
    manifest.screens = manifest.screens.filter((s) => s.journey !== j.id);
    for (let k = 0; k <= actions.length; k++) {
      const screen = {
        ...page0,
        id: `journey--${j.id}--${k}`,
        title: `${j.title} ${k}/${actions.length}: ${k ? stepLabel(actions[k - 1]) : 'start'}`,
        steps: [...(page0.steps || []), ...groups.slice(0, k + 1).flat()],
        flow: `journey:${j.id}`, step: k + 1, state: null,
        journey: j.id, journeyStep: k, journeyAction: k ? stepLabel(actions[k - 1]) : null,
        notes: `Journey "${j.title}"${j.critical ? ' (must not fail)' : ''}, step ${k} of ${actions.length}${k ? `, after tapping "${stepLabel(actions[k - 1])}"` : ''}.`,
      };
      process.stderr.write(`capturing ${screen.id}\n`);
      try {
        for (const s of await captureWithRelaunch(screen)) { relSource(s); putScreen(s); }
        record.screens.push(screen.id);
      } catch (e) {
        record.brokenAt = k;
        record.error = e.message.split('\n')[0];
        manifest.warnings.push(`journey ${j.id} broke at ${k ? `step ${k} ("${stepLabel(actions[k - 1])}")` : 'its start, before the first step'}: ${record.error}`);
        break;
      }
    }
    const i = manifest.journeys.findIndex((r) => r.id === j.id);
    if (i >= 0) manifest.journeys[i] = record; else manifest.journeys.push(record);
    writeManifest();
  }

  // States found by the crawler (scripts/crawl/crawl.mjs): each becomes a screen reached by its path
  // from the crawl start it was found from.
  // A subset or resume reuses the run's inventory unless another one is given.
  const invFile = args.inventory ? path.resolve(args.inventory) : previous?.inventory ? path.resolve(runDir, previous.inventory) : null;
  if (invFile && fs.existsSync(invFile)) {
    const inv = JSON.parse(fs.readFileSync(invFile, 'utf8'));
    const page0Of = new Map();
    const startPage = (id) => {
      if (!page0Of.has(id)) page0Of.set(id, expandMockup(cfg.mockups.find((m) => m.id === id) || cfg.mockups[0], runDir).screens[0]);
      return page0Of.get(id);
    };
    manifest.inventory = path.relative(runDir, invFile);
    for (const st of inv.states) {
      const id = `crawl--${st.id}`;
      if (!wanted(st.id, id) || done(id)) continue;
      const page0 = startPage(st.start || inv.start);
      const screen = { ...page0, id, title: st.title, steps: [...(page0.steps || []), ...st.steps], flow: 'crawl', step: null, state: null, inventoryState: st.id, notes: `Found by the crawler at depth ${st.depth}${st.steps.length ? ` (${st.steps.map(stepLabel).join(' → ')})` : ''}.` };
      process.stderr.write(`capturing ${screen.id}\n`);
      try { for (const s of await captureWithRelaunch(screen)) { relSource(s); putScreen(s); } }
      catch (e) { manifest.warnings.push(`${screen.id}: capture failed: ${e.message.split('\n')[0]}`); }
      writeManifest();
    }
  }
} finally {
  await browser.close().catch(() => {});
}

function stepLabel(st) {
  if (typeof st === 'string') return st;
  const [k, v] = Object.entries(st).find(([key]) => key !== 'value') || ['', ''];
  return k === 'tap' ? String(v) : `${k} ${v}`;
}

// Snapshot the frame and tokens the run was judged against, so old reports stay interpretable.
if (manifest.product) { fs.copyFileSync(manifest.product, path.join(runDir, 'framing.md')); manifest.framingSnapshot = 'framing.md';
  const unfilled = unfilledSections(fs.readFileSync(manifest.product, 'utf8'));
  if (unfilled.length) manifest.warnings.push(unfilledMessage(unfilled));
}
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
// Warnings from an earlier capture of a screen this run captured again no longer apply.
if (previous) {
  const fresh = new Set(manifest.warnings.slice(0));
  const recaptured = (w) => manifest.screens.some((s) => w.startsWith(`${s.id}: capture failed`));
  const rerun = (w) => { const m = w.match(/^journey (\S+) /); return m && cfg.journeys.some((j) => j.id === m[1] && wantedJourney(j.id)); };
  manifest.warnings = [...new Set([...(previous.warnings || []).filter((w) => !recaptured(w) && !rerun(w)), ...fresh])];
}
manifest.complete = true;
writeManifest();
for (const w of manifest.warnings) process.stderr.write(`warning: ${w}\n`);
const captures = manifest.screens.reduce((n, s) => n + s.captures.length, 0);
console.log(`Captured ${manifest.screens.length} screens (${captures} renders)`);
console.log(`RUN_DIR=${runDir}`);
if (!manifest.screens.length) process.exit(1);

// Runs in the page: the document as it is now, without scripts (so it doesn't start over when
// opened) and with a <base> so its styles and images still load. Open shadow roots are kept as
// declarative shadow DOM.
function domSnapshot() {
  const html = document.documentElement.getHTML ? document.documentElement.getHTML({ serializableShadowRoots: true, shadowRoots: [...document.querySelectorAll('*')].map((e) => e.shadowRoot).filter(Boolean) }) : document.documentElement.innerHTML;
  const doc = new DOMParser().parseFromString(`<html>${html}</html>`, 'text/html');
  for (const el of doc.querySelectorAll('script')) el.remove();
  for (const el of doc.querySelectorAll('*')) for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  const base = doc.createElement('base');
  base.href = location.href;
  doc.head.prepend(base);
  return `<!doctype html>\n<html lang="${document.documentElement.lang || ''}">${doc.documentElement.innerHTML}</html>`;
}
