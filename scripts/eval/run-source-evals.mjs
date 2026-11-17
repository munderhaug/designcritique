#!/usr/bin/env node
// Source eval: run the detector stage on evals/source/{seeded,clean} (SwiftUI, Compose,
// Android XML, React Native) with no mockups, and score against evals/source/expected.json.
//
// Usage: node scripts/eval/run-source-evals.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, timestamp } from '../lib/config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, 'evals', 'source');
const expected = readJson(path.join(dir, 'expected.json'));
let failures = 0;
for (const set of ['seeded', 'clean']) {
  const runDir = path.join(root, 'evals', '.runs', `source-${set}-${timestamp()}`);
  // A run with app source and no screens: what a native app's critique starts from.
  writeJson(path.join(runDir, 'manifest.json'), { version: 1, baseDir: path.join(dir, set), platform: 'adaptive', source: ['.'], language: ['en'], pageLanguages: [], screens: [] });
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'checks', 'detectors.mjs'), '--run', runDir], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  const findings = readJson(path.join(runDir, 'checks', 'detectors.json'), []);
  const exp = expected[set];
  const missing = (exp.must || []).filter(([rule, file]) => !findings.some((f) => f.rule === rule && f.instances.some((i) => i.file === file)));
  const dirty = exp.clean ? findings.filter((f) => f.severity !== 'P3') : [];
  const ok = !missing.length && !dirty.length;
  if (!ok) failures++;
  console.log(`${set.padEnd(8)} ${ok ? 'pass' : 'FAIL'}  ${findings.length} findings${missing.length ? `; missing ${missing.map((m) => m.join(' in ')).join(', ')}` : ''}${dirty.length ? `; not clean: ${dirty.map((f) => `${f.rule} ${f.severity}`).join(', ')}` : ''}`);
  if (exp.must) console.log(`         recall ${exp.must.length - missing.length}/${exp.must.length}`);
  fs.rmSync(runDir, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
