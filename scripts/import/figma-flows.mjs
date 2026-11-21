#!/usr/bin/env node
// Read a Figma prototype's flows and write what a review needs from them, without hand-writing
// journeys or crawling anything:
//   <out>/inventory.json     the prototype's navigation graph, in the crawler's shape
//   <out>/mockups.figma.yaml one image mockup per frame, ordered by flow and step, to paste into mockups.yaml
//   <out>/<frame>.png        each frame, with --images
// Then: capture with `--inventory <out>/inventory.json`, and the structure checks (ways back,
// dead ends, depth, orphans, inconsistent navigation) run on the design itself.
//
// Usage:
//   FIGMA_TOKEN=… node scripts/import/figma-flows.mjs --file <file key> [--page "Page name"] [--out figma] [--images]
//   node scripts/import/figma-flows.mjs --json <saved GET /v1/files/:key response> [--out figma]
// The token is a Figma personal access token with file read access; it is read from the
// environment only and never written anywhere.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { parseArgs, writeJson } from '../lib/config.mjs';
import { figmaToInventory } from '../lib/figma.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.file && !args.json) { console.error('Usage: figma-flows.mjs --file <key> [--page name] [--out dir] [--images]   (needs FIGMA_TOKEN)  |  --json <file.json>'); process.exit(2); }
const out = path.resolve(args.out || 'figma');
const token = process.env.FIGMA_TOKEN;
const api = async (url) => {
  if (!token) { console.error('Set FIGMA_TOKEN (a Figma personal access token with file read access).'); process.exit(2); }
  const r = await fetch(url, { headers: { 'X-Figma-Token': token } });
  if (!r.ok) { console.error(`Figma API ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1); }
  return r.json();
};

const file = args.json ? JSON.parse(fs.readFileSync(path.resolve(args.json), 'utf8')) : await api(`https://api.figma.com/v1/files/${encodeURIComponent(args.file)}`);
const result = figmaToInventory(file, { page: args.page && args.page !== true ? String(args.page) : null, imageDir: '.' });
if (!result.frames.length) { console.error(`No frames found${args.page ? ` on page "${args.page}"` : ''} (pages: ${(file.document?.children || []).map((p) => p.name).join(', ')}).`); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
writeJson(path.join(out, 'inventory.json'), result.inventory);
const rel = path.relative(process.cwd(), out) || '.';
fs.writeFileSync(path.join(out, 'mockups.figma.yaml'), `# From Figma${file.name ? ` file "${file.name}"` : ''}: one image mockup per frame. Paste under mockups: in mockups.yaml.\n# Images are critiqued by the reviewers; the prototype's structure is checked from inventory.json:\n#   node scripts/capture/capture.mjs --config mockups.yaml --inventory ${rel}/inventory.json\n${YAML.stringify({ mockups: result.mockups.map((m) => ({ ...m, file: `${rel}/${m.id}.png` })) })}`);

if (args.images && args.file) {
  const ids = result.frames.map((f) => f.nodeId);
  for (let i = 0; i < ids.length; i += 50) {
    const res = await api(`https://api.figma.com/v1/images/${encodeURIComponent(args.file)}?ids=${encodeURIComponent(ids.slice(i, i + 50).join(','))}&format=png&scale=2`);
    for (const f of result.frames.slice(i, i + 50)) {
      const url = res.images?.[f.nodeId];
      if (!url) { console.error(`no image for ${f.title}`); continue; }
      fs.writeFileSync(path.join(out, `${f.id}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
    }
  }
}
const inv = result.inventory;
console.log(`Figma: ${result.frames.length} frames on ${result.pages.length} page(s); ${inv.states.length} reachable from ${inv.starts.length} starting point(s), ${inv.transitions.length} links${result.unreachable.length ? `; not reachable in the prototype: ${result.unreachable.slice(0, 8).join(', ')}${result.unreachable.length > 8 ? ', …' : ''}` : ''}`);
console.log(`Wrote ${path.join(out, 'inventory.json')} and ${path.join(out, 'mockups.figma.yaml')}${args.images && args.file ? ` and ${result.frames.length} PNGs` : '; export the frames as PNG to the paths in the YAML (or run with --images)'}`);
