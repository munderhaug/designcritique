#!/usr/bin/env node
// Compare two critique runs. Default base: the previous run in the same folder.
// Usage: node scripts/report/compare-runs.mjs --run <runDir> [--base <runDir>] [--json]
import path from 'node:path';
import { parseArgs, readJson } from '../lib/config.mjs';
import { findPreviousRun, compareFindings } from '../lib/compare.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: compare-runs.mjs --run <runDir> [--base <runDir>]'); process.exit(2); }
const runDir = path.resolve(args.run);
const baseDir = args.base ? path.resolve(args.base) : findPreviousRun(runDir);
if (!baseDir) { console.log('No earlier run with findings.json to compare against.'); process.exit(0); }
const cur = readJson(path.join(runDir, 'findings.json'));
const base = readJson(path.join(baseDir, 'findings.json'));
const screens = new Set(readJson(path.join(runDir, 'manifest.json')).screens.map((s) => s.id));
const c = compareFindings(base.findings, cur.findings, screens);
if (args.json) { console.log(JSON.stringify({ base: baseDir, ...c }, null, 2)); process.exit(0); }
console.log(`Compared with ${baseDir}`);
console.log(`Fixed ${c.fixed.length} · New ${c.introduced.length} · Still open ${c.persisting.length}${c.notRechecked.length ? ` · Not re-checked ${c.notRechecked.length}` : ''}`);
for (const f of c.fixed) console.log(`  fixed  ${f.severity} ${f.screen} ${f.title}`);
for (const f of c.introduced) console.log(`  new    ${f.severity} ${f.screen} ${f.title}`);
