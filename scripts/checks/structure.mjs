#!/usr/bin/env node
// Whole-product structure for a run: coverage (features, journeys, states), the navigation graph
// from the crawler's inventory, and deterministic continuity findings.
// Writes checks/structure.json, coverage.json and graph.json.
//
// Usage: node scripts/checks/structure.mjs --run <RUN_DIR>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs, readJson, writeJson } from '../lib/config.mjs';
import { productModel } from '../lib/product.mjs';
import { coverage, screenGraph, structureFindings } from '../lib/structure.mjs';
import { loadVocabulary, languagesOf } from '../lib/vocabulary.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) { console.error('Usage: structure.mjs --run <RUN_DIR>'); process.exit(2); }
const runDir = path.resolve(args.run);
const manifest = readJson(path.join(runDir, 'manifest.json'));
const framing = manifest.framingSnapshot ? fs.readFileSync(path.join(runDir, manifest.framingSnapshot), 'utf8') : '';
const model = productModel(framing);
const invPath = manifest.inventory ? path.join(runDir, manifest.inventory) : path.join(runDir, 'inventory.json');
const inventory = fs.existsSync(invPath) ? readJson(invPath) : null;

const textOf = (screen) => {
  const cap = screen.captures.find((c) => c.variant === 'light' && (c.device === 'standard' || c.device === 'frame')) || screen.captures[0];
  if (!cap?.data) return { text: '', screenKey: `image:${screen.id}` };
  const d = readJson(path.join(runDir, cap.data));
  const text = d.fingerprint?.snapshot || [...d.texts.map((t) => t.text), ...d.interactive.map((i) => i.name)].join('\n');
  return { text, screenKey: d.fingerprint?.screenKey || `screen:${screen.id}`, title: d.fingerprint?.title };
};
const screens = manifest.screens.map((s) => {
  const t = textOf(s);
  return { id: s.id, title: s.title, text: t.text, screenKey: t.screenKey, journey: s.journey || null, hint: [s.id, s.title, s.notes, s.state].filter(Boolean).join(' ') };
});
const journeysRun = manifest.journeys || [];
const finalTexts = Object.fromEntries(journeysRun.map((j) => [j.id, screens.find((s) => s.id === j.screens[j.screens.length - 1])?.text || '']));
const journeyKeys = Object.fromEntries(journeysRun.map((j) => [j.id, j.screens.map((id) => screens.find((s) => s.id === id)?.screenKey)]));
const startText = inventory?.states?.[0]?.snapshot || screens.find((s) => !s.journey)?.text || '';
const corpus = screens.map((s) => s.text).join('\n');

const vocab = loadVocabulary(languagesOf([manifest.language, manifest.pageLanguages, inventory?.languages]), manifest.vocabulary || {});
const cov = coverage({ screens, model, journeysRun, inventory, vocab });
const graph = inventory ? screenGraph(inventory) : null;
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const findings = structureFindings({ model, cov, inventory, graph, journeysRun, startText, finalTexts, corpus, journeyKeys, vocab }).map((f) => ({
  ...f,
  id: `chk-structure-${f.rule.toLowerCase().replace(/^chk-/, '')}-${hash((f.affected || []).join('|') + (f.journey || ''))}`,
  affected_screens: f.affected || [],
  evidence: f.evidence,
}));

writeJson(path.join(runDir, 'checks', 'structure.json'), findings);
writeJson(path.join(runDir, 'coverage.json'), cov);
if (graph) writeJson(path.join(runDir, 'graph.json'), graph);
const seen = cov.features.filter((f) => f.seen).length;
console.log(`Structure: ${findings.length} findings; features seen ${seen}/${cov.features.length}; journeys scripted ${cov.journeys.filter((j) => j.scripted).length}/${cov.journeys.length}${graph ? `; graph ${graph.nodes.length} screens, ${graph.edges.length} links` : '; no inventory (run the crawler for the graph)'}`);
