#!/usr/bin/env node
// Print build-stack recommendations for a run (or for a PRODUCT.md alone).
//
// Usage: node scripts/report/recommend-stack.mjs --run <runDir>
//        node scripts/report/recommend-stack.mjs --product PRODUCT.md [--json]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson } from '../lib/config.mjs';
import { recommendStack, stackMarkdown } from '../lib/stack.mjs';

const args = parseArgs(process.argv.slice(2));
let productText = '';
let findings = [];
let fallbackPlatform;
if (args.run) {
  const runDir = path.resolve(args.run);
  const manifest = readJson(path.join(runDir, 'manifest.json'));
  if (manifest.framingSnapshot) productText = fs.readFileSync(path.join(runDir, manifest.framingSnapshot), 'utf8');
  findings = readJson(path.join(runDir, 'findings.json'), { findings: readJson(path.join(runDir, 'checks', 'findings.json'), []) }).findings;
  fallbackPlatform = manifest.screens[0]?.platform;
} else if (args.product) {
  productText = fs.readFileSync(path.resolve(args.product), 'utf8');
} else {
  console.error('Usage: recommend-stack.mjs --run <runDir> | --product PRODUCT.md');
  process.exit(2);
}
const rec = recommendStack({ productText, fallbackPlatform, findings });
console.log(args.json ? JSON.stringify(rec, null, 2) : stackMarkdown(rec));
