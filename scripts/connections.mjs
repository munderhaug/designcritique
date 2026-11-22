#!/usr/bin/env node
// What the plugin can connect to that needs something from the designer: an account, a token,
// a device or an install. Run at the start of every session that uses the plugin, so the
// designer chooses up front what to set up, instead of finding out half-way through a run.
// It only looks; it connects, installs and asks for nothing itself.
//
// MCP servers (Mobbin, Refero, Figma) can't be seen from a script: the orchestrating model
// checks its own tool list for them and fills in their state.
//
// Usage: node scripts/connections.mjs [--project <dir>] [--config mockups.yaml] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { parseArgs } from './lib/config.mjs';

const args = parseArgs(process.argv.slice(2));
const project = path.resolve(args.project || process.cwd());
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const has = (cmd, a = ['--version']) => { const r = spawnSync(cmd, a, { encoding: 'utf8', timeout: 8000 }); return !r.error && r.status === 0 ? (r.stdout || '') : null; };

// What the project's own files say it uses, so the question can lead with what matters here.
let cfg = {};
const cfgPath = path.resolve(project, args.config || 'mockups.yaml');
try { cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8')) || {}; } catch { /* no config yet */ }
const mockups = cfg.mockups || [];
const usesFigma = mockups.some((m) => m.figma_node) || fs.existsSync(path.join(project, 'figma', 'inventory.json'));
const usesNative = Array.isArray(cfg.native) ? cfg.native.length > 0 : !!cfg.native;

// Companion skills: their own finder.
let companions = {};
const c = spawnSync(process.execPath, [path.join(root, 'scripts', 'companions.mjs'), '--project', project], { encoding: 'utf8' });
try { companions = JSON.parse(c.stdout); } catch { /* reported as unknown */ }
const missingCore = ['design-critique', 'accessibility-review', 'ux-copy', 'impeccable', 'product-brainstorming'].filter((k) => companions[k] && !companions[k].found);

const adbDevices = has('adb', ['devices']);
const booted = adbDevices ? adbDevices.split('\n').slice(1).filter((l) => /\tdevice$/.test(l)).length : 0;
const simctl = has('xcrun', ['simctl', 'list', 'devices', 'booted']);
const simBooted = simctl ? (simctl.match(/\(Booted\)/g) || []).length : 0;

const items = [
  {
    id: 'companions', name: 'Critique methods (Impeccable, Anthropic design and product-management skills)', kind: 'install',
    state: missingCore.length ? `missing: ${missingCore.join(', ')}` : 'installed',
    ready: !missingCore.length, relevant: true,
    enables: 'The two independent critics and the frame challenger use these methods; without them they fall back to the principles index.',
    setup: `bash ${path.join(root, 'scripts', 'setup.sh')} --install-companions`,
  },
  {
    id: 'references', name: 'Shipped-app references (Mobbin or Refero MCP)', kind: 'mcp, paid account',
    state: 'check your tools for mcp__Mobbin__* or refero_* and run the one-call probe in references.md',
    ready: null, relevant: true,
    enables: 'Comparable screens and flows from shipped apps for the key tasks. Optional: the critique works without them.',
    setup: 'claude mcp add --transport http mobbin https://api.mobbin.com/mcp (or refero https://api.refero.design/mcp), then sign in from /mcp',
  },
  {
    id: 'figma', name: 'Figma (frames, and a prototype\'s flows)', kind: 'mcp or token',
    state: `${process.env.FIGMA_TOKEN ? 'FIGMA_TOKEN set' : 'no FIGMA_TOKEN'}; check your tools for a Figma MCP server`,
    ready: process.env.FIGMA_TOKEN ? true : null, relevant: usesFigma,
    enables: 'Frames as inputs (Figma MCP) and, with a token, the prototype\'s flow graph for the structure checks (scripts/import/figma-flows.mjs). Optional: exported PNGs work without it.',
    setup: 'Figma MCP: see Figma\'s own guide. Flow import: a personal access token with file read access, given to the session as a secret, never pasted into chat.',
  },
  {
    id: 'native', name: 'A running native app (simulator or emulator, Maestro)', kind: 'device, install',
    state: [`maestro ${has('maestro') ? 'installed' : 'not found'}`, adbDevices ? `${booted} Android device(s) or emulator(s) connected` : 'adb not found', simctl ? `${simBooted} iOS simulator(s) booted` : 'xcrun not found (iOS needs a Mac)'].join('; '),
    ready: !!has('maestro') && (booted + simBooted) > 0, relevant: usesNative,
    enables: 'Screens of the real app with target-size and screen-reader-name checks (experimental). Optional: screenshots work as image inputs without it.',
    setup: 'Install Maestro (maestro.dev) and boot an Android emulator or iOS simulator on a machine attached to this session.',
  },
];

// Where the designs go, so the designer can keep unreleased or client work to as few places as
// they want (sharing: local in mockups.yaml).
const external = (cfg.critics?.external || []).map(String);
const sharing = cfg.sharing === 'local' ? 'local' : 'normal';
const destinations = [
  { to: 'The model reviewers (Anthropic, through Claude Code)', what: 'screenshots, the frame, and for some reviewers the HTML', always: true },
  { to: `External judges on other providers${external.length ? ` (${external.join(', ')})` : ''}`, what: 'the same as the reviewers', used: external.length > 0 && sharing !== 'local' },
  { to: 'Mobbin or Refero, when connected', what: 'short searches describing the key tasks (no screenshots)', used: sharing !== 'local' },
  { to: 'Figma, when connected', what: 'reads your files; sends nothing of the run', used: sharing !== 'local' },
];

if (args.json) { console.log(JSON.stringify({ project, items, sharing, destinations }, null, 2)); process.exit(0); }
const mark = (i) => (i.ready === true ? 'ready' : i.ready === false ? 'not set up' : 'check');
console.log('Connections that need something from you (nothing is connected or installed without asking):');
for (const i of [...items.filter((x) => x.relevant), ...items.filter((x) => !x.relevant)]) {
  console.log(`- [${mark(i)}] ${i.name}${i.relevant ? '' : ' (not used by this project yet)'}: ${i.state}`);
  console.log(`    gives: ${i.enables}`);
  if (i.ready !== true) console.log(`    to set up: ${i.setup}`);
}
console.log(`\nWhere your designs go (sharing: ${sharing}; set sharing: local in mockups.yaml to keep them to the model reviewers):`);
for (const d of destinations) console.log(`- ${d.always ? 'always' : d.used ? 'yes' : 'no'}: ${d.to}: ${d.what}`);
