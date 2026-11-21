#!/usr/bin/env node
// EXPERIMENTAL. Capture a native app on a booted iOS simulator or Android emulator: for every
// screen under `native:` in mockups.yaml, launch the app, tap to the screen, and save a
// screenshot and the accessibility hierarchy in light, dark and large text. The screens join the
// run's manifest, so the target-size and unnamed-control checks, the critics and the report
// treat them like any other screen.
//
// Driven by scripts, not by a model: Maestro's CLI replays the taps and prints the hierarchy
// (mobile.dev, Apache-2.0; it sends usage analytics unless MAESTRO_CLI_NO_ANALYTICS is set,
// which this script sets), `adb` or `xcrun simctl` switch appearance and text size and take the
// screenshot. Needs: Maestro on PATH, and a booted emulator (adb) or simulator (Xcode, macOS).
// The hierarchy adapter is unit-tested; this driver has not been run in the plugin's own
// environment, which has no simulator. Report what it prints if it fails.
//
// Usage: node scripts/capture/native.mjs --config mockups.yaml --out <RUN_DIR> [--only id,id]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, parseArgs, readJson, writeJson, timestamp, DEVICE_PRESETS } from '../lib/config.mjs';
import { hierarchyToData, flowFor, variantCommands } from '../lib/native.mjs';

const args = parseArgs(process.argv.slice(2));
const cfg = loadConfig(args.config || 'mockups.yaml');
if (!cfg.native.length) { console.log('No native: apps in the config; nothing to do.'); process.exit(0); }
const runDir = path.resolve(args.out || path.join(cfg.output, timestamp()));
const only = args.only ? new Set(String(args.only).split(',')) : null;
const env = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' };
const run = (cmd, a, opts = {}) => spawnSync(cmd, a, { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024, timeout: 180000, ...opts });
const need = (cmd, why) => { if (run(cmd, ['--version']).error) { console.error(`${cmd} not found: ${why}`); process.exit(2); } };
need('maestro', 'install Maestro (https://maestro.dev) to replay taps and read the hierarchy');

const manifestPath = path.join(runDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : { version: 1, createdAt: new Date().toISOString(), config: cfg.configPath, baseDir: cfg.baseDir, gate: cfg.gate, critics: cfg.critics, platform: cfg.platform, screens: [], warnings: [], taste: [], journeys: [] };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-native-'));
for (const dir of ['screenshots', 'data']) fs.mkdirSync(path.join(runDir, dir), { recursive: true });

for (const app of cfg.native) {
  const android = app.platform === 'android';
  need(android ? 'adb' : 'xcrun', android ? 'the Android platform tools, with an emulator booted' : 'Xcode command line tools on macOS, with a simulator booted');
  // Android hierarchies are in device pixels: scale to dp. iOS ones are already in points.
  const density = android ? Number((run('adb', ['shell', 'wm', 'density']).stdout.match(/(\d+)\s*$/m) || [])[1]) || 160 : 160;
  const scale = density / 160;
  const preset = DEVICE_PRESETS[android ? 'android' : 'ios'].standard;
  for (const sc of app.screens) {
    const id = `${app.id}--${sc.id}`;
    if (only && !only.has(id) && !only.has(app.id)) continue;
    process.stderr.write(`capturing ${id}\n`);
    const flow = path.join(tmp, `${id}.yaml`);
    fs.writeFileSync(flow, flowFor(app.app, sc.steps, { clearState: app.clear_state }));
    const captures = [];
    let failed = null;
    for (const variant of ['light', 'dark', 'large-text'].filter((v) => v === 'light' || cfg.variants.includes(v))) {
      for (const [cmd, a] of variantCommands(app.platform, variant)) run(cmd, a);
      const replay = run('maestro', ['test', flow]);
      if (replay.status !== 0) { failed = `${variant}: ${(replay.stdout + replay.stderr).split('\n').filter(Boolean).slice(-2).join(' ')}`; break; }
      const tag = `${id}__${app.platform}-standard__${variant}`;
      const shot = path.join(runDir, 'screenshots', `${tag}.png`);
      if (android) fs.writeFileSync(shot, run('adb', ['exec-out', 'screencap', '-p'], { encoding: 'buffer' }).stdout);
      else run('xcrun', ['simctl', 'io', 'booted', 'screenshot', shot]);
      const h = run('maestro', ['hierarchy']);
      let data = null;
      try { data = hierarchyToData(JSON.parse(h.stdout.slice(h.stdout.indexOf('{'))), { scale }); } catch { manifest.warnings.push(`${id} (${variant}): hierarchy could not be read; critics only`); }
      let dataRel = null;
      if (data) { dataRel = `data/${tag}.json`; writeJson(path.join(runDir, dataRel), data); }
      captures.push({ platform: app.platform, device: 'standard', deviceName: android ? 'Android emulator' : 'iOS simulator', variant, viewport: data?.viewport || null, safeTop: preset.safeTop, safeBottom: preset.safeBottom, screenshot: `screenshots/${tag}.png`, data: dataRel, surface: 'native-render' });
    }
    for (const [cmd, a] of variantCommands(app.platform, 'light')) run(cmd, a);
    if (failed) { manifest.warnings.push(`${id}: capture failed: ${failed}`); continue; }
    const screen = { id, mockupId: app.id, title: sc.title, kind: 'native', platform: app.platform, source: app.app, sourceFiles: [], steps: sc.steps.map((s) => ({ tap: s })), notes: sc.notes, flow: app.id, step: app.screens.indexOf(sc) + 1, captures };
    const i = manifest.screens.findIndex((x) => x.id === id);
    if (i >= 0) manifest.screens[i] = screen; else manifest.screens.push(screen);
    writeJson(manifestPath, manifest);
  }
}
writeJson(manifestPath, manifest);
console.log(`Native: ${manifest.screens.filter((s) => s.kind === 'native').length} screens captured`);
console.log(`RUN_DIR=${runDir}`);
