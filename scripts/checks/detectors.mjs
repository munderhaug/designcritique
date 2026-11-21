#!/usr/bin/env node
// Detector stage: two third-party anti-pattern detectors, each on the surfaces it can read.
//   Impeccable (Paul Bakaus, pinned in package.json): its browser mode on each rendered HTML
//     mockup or served PWA at the phone viewport, and its static mode on HTML/CSS/JSX source.
//   unslopovich (pinned in package.json): its static scan of app source (SwiftUI, Compose,
//     Android XML, React Native, Flutter, web), from the mockup files and `source:` paths.
// Only allowlisted rules are imported, mapped to principle IDs (scripts/lib/detectors.mjs).
// Both run locally with telemetry and update checks off; neither needs an account.
//
//   node scripts/checks/detectors.mjs --run <runDir> [--engines impeccable,unslopovich]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson, writeJson, isRemote, pageUrl, DEVICE_PRESETS } from '../lib/config.mjs';
import { mapDetectorFinding, collapseDetectorFindings, screenForFile, engineReads, isEnglish } from '../lib/detectors.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: detectors.mjs --run <runDir> [--engines impeccable,unslopovich]'); process.exit(2); }
const runDir = path.resolve(args.run);
const manifest = readJson(path.join(runDir, 'manifest.json'));
const engines = new Set(String(args.engines || 'impeccable,unslopovich').split(','));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const abs = (p) => (isRemote(p) ? p : path.resolve(manifest.baseDir, p));
const rel = (p) => (isRemote(p) ? p : path.relative(manifest.baseDir, p) || p);

// Screens a detector can open by itself: no setup script or steps to reach them.
const screens = manifest.screens.map((s) => ({
  ...s,
  source: abs(s.source),
  sourceFiles: (s.sourceFiles || []).map(abs),
  // A journey's or the crawl's first screen without steps is the page as it loads.
  hasSteps: !!(s.setup || (s.steps || []).length || s.frameIndex),
}));
const reachable = screens.filter((s) => s.kind === 'html' && !s.hasSteps);
// Screens reached by steps: capture saved their DOM as reached (dom/*.html, scripts removed),
// which the rendered detector can open like any page.
const domOf = (s) => s.captures?.find((c) => c.dom && c.variant === 'light')?.dom;
const snapshots = screens.filter((s) => s.kind === 'html' && s.hasSteps && domOf(s)).map((s) => ({ ...s, rendered: path.join(runDir, domOf(s)) }));
const english = isEnglish([...(manifest.language || []), ...(manifest.pageLanguages || [])]);
const notes = [];
const raw = [];

const ENV = { ...process.env, DO_NOT_TRACK: '1', IMPECCABLE_NO_TELEMETRY: '1', IMPECCABLE_NO_UPDATE_CHECK: '1', CI: '1' };
try {
  // Impeccable's browser mode finds Chrome itself; point it at Playwright's when it has one.
  const exe = require('playwright').chromium.executablePath();
  if (exe && fs.existsSync(exe) && !ENV.IMPECCABLE_BROWSER) ENV.IMPECCABLE_BROWSER = exe;
} catch { /* fall back to Impeccable's own browser lookup */ }

function impeccable(targets, extra = []) {
  let cli;
  try { cli = path.join(path.dirname(require.resolve('impeccable/package.json')), 'cli', 'bin', 'cli.js'); } catch { cli = null; }
  if (!cli || !fs.existsSync(cli)) { notes.push(`Impeccable isn't installed; run bash ${path.join(ROOT, 'scripts', 'setup.sh')}`); return []; }
  const r = spawnSync(process.execPath, [cli, 'detect', '--json', '--no-config', ...extra, ...targets], { encoding: 'utf8', env: ENV, maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
  try { return JSON.parse(r.stdout || '[]'); } catch {
    notes.push(`Impeccable detect gave no JSON (exit ${r.status}): ${(r.stderr || '').split('\n').find(Boolean) || 'no output'}`);
    return [];
  }
}

// ---------- rendered: Impeccable in a browser at each platform's phone viewport ----------
if (engines.has('impeccable')) {
  const byViewport = new Map();
  for (const s of [...reachable.filter((x) => !x.phoneFrame), ...snapshots]) {
    const p = DEVICE_PRESETS[s.platform === 'android' ? 'android' : 'ios'].standard;
    const vp = `${p.width}x${p.height}`;
    if (!byViewport.has(vp)) byViewport.set(vp, new Map());
    const urls = byViewport.get(vp);
    const url = pageUrl(s.rendered || s.source);
    if (!urls.has(url)) urls.set(url, s);
  }
  for (const [vp, urls] of byViewport) {
    const found = impeccable([...urls.keys()], ['--viewport', vp]);
    for (const f of found) {
      const s = urls.get(f.file) || urls.get(String(f.file).replace(/\/$/, ''));
      raw.push({ ctx: s, f: { engine: 'impeccable', surface: 'rendered', rule: f.antipattern, message: f.name, snippet: f.snippet, file: rel(s ? s.source : f.file), fix: f.description } });
    }
    notes.push(`Impeccable (rendered, ${vp}): ${urls.size} page(s), ${found.length} raw findings.`);
  }
}

// ---------- source: the mockup files themselves and the app source in source: ----------
const sourceTargets = [
  ...new Set([
    ...reachable.filter((s) => !isRemote(s.source)).map((s) => s.source),
    ...(manifest.source || []).map(abs),
    ...screens.flatMap((s) => s.sourceFiles),
  ]),
].filter((p) => fs.existsSync(p));

if (engines.has('impeccable') && sourceTargets.length) {
  const targets = sourceTargets.filter((p) => fs.statSync(p).isDirectory() || engineReads('impeccable', p));
  const found = targets.length ? impeccable(targets) : [];
  for (const f of found) {
    const file = path.resolve(f.file);
    raw.push({ ctx: screenForFile(file, screens), f: { engine: 'impeccable', surface: 'source', rule: f.antipattern, message: f.name, snippet: f.snippet, file: rel(file), line: f.line || null, fix: f.description } });
  }
  notes.push(`Impeccable (source): ${targets.length} path(s), ${found.length} raw findings.`);
}

if (engines.has('unslopovich') && sourceTargets.length) {
  let detector = null;
  try { detector = require('unslopovich/skills/unslopovich/scripts/detect.js'); } catch { notes.push(`unslopovich isn't installed; run bash ${path.join(ROOT, 'scripts', 'setup.sh')}`); }
  if (detector) {
    // Mobile, whatever package.json says: the critique is of a phone app.
    const result = detector.scan(sourceTargets, { platform: 'mobile' });
    for (const f of result.findings) {
      const file = path.resolve(process.cwd(), f.file);
      raw.push({ ctx: screenForFile(file, screens), f: { engine: 'unslopovich', surface: 'source', rule: f.rule, message: f.message, snippet: f.snippet, file: rel(file), line: f.line, fix: f.fix } });
    }
    notes.push(`unslopovich (source): ${result.filesScanned} files, ${result.findings.length} raw findings.`);
    if (result.unreadable.length) notes.push(`unslopovich could not read ${result.unreadable.length} file(s).`);
  }
}
if (!sourceTargets.length && !reachable.length) notes.push('No HTML mockups, served pages or source: paths: nothing for the detectors.');
if (snapshots.length) notes.push(`${snapshots.length} screen(s) reached by steps, journeys or the crawler were checked from the DOM capture saved (without scripts; styles inside web components' shadow roots may be missing).`);
const skipped = screens.filter((s) => s.kind === 'html' && s.hasSteps && !domOf(s)).length;
if (skipped) notes.push(`${skipped} screen(s) reached by steps, journeys or the crawler were not opened by the detectors (no DOM capture: capture them again to add one).`);

const mapped = raw
  .map(({ ctx, f }) => mapDetectorFinding(f, { screen: ctx?.id || '*', mockup: ctx?.mockupId || null, platform: ctx?.platform || manifest.platform || manifest.screens[0]?.platform || null, english }))
  .filter(Boolean);
const findings = collapseDetectorFindings(mapped);
writeJson(path.join(runDir, 'checks', 'detectors.json'), findings);
writeJson(path.join(runDir, 'detectors', 'notes.json'), notes);
console.log(`Detectors: ${findings.length} findings (${mapped.length} hits on allowlisted rules of ${raw.length})`);
for (const n of notes) console.log(`  ${n}`);
