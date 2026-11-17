// Turns configured mockups (html, image, .zip, folder, pulled artifact) into a flat list of screens.
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { HTML_EXT, IMAGE_EXT, slug } from './config.mjs';

const MAX_SCREENS_PER_SOURCE = 40;
const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', '__MACOSX', '.designcritique']);

/**
 * Extracts a zip into destDir. Zip contents are untrusted: entries that would land
 * outside destDir (zip-slip), symlinks and oversized archives are refused.
 */
export function extractZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  let total = 0;
  fs.mkdirSync(destDir, { recursive: true });
  const root = path.resolve(destDir) + path.sep;
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (name.startsWith('__MACOSX/') || name.split('/').some((p) => p === '..')) continue;
    const target = path.resolve(destDir, name);
    if (!target.startsWith(root)) throw new Error(`Refusing zip entry outside the target folder: ${name}`);
    // Unix mode lives in the high 16 bits of the external attributes; 0o120000 marks a symlink.
    const mode = (entry.header.attr >>> 16) & 0o170000;
    if (mode === 0o120000) continue;
    if (entry.isDirectory) { fs.mkdirSync(target, { recursive: true }); continue; }
    total += entry.header.size;
    if (total > MAX_ZIP_BYTES) throw new Error(`Zip ${zipPath} expands past ${MAX_ZIP_BYTES} bytes; refusing`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
  }
  return destDir;
}

function walk(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = fs.lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

/** Pick the screens inside a folder: the entry page if given, else HTML pages, else images. */
function screensInFolder(dir, entry) {
  if (entry) {
    const f = path.resolve(dir, entry);
    if (!f.startsWith(path.resolve(dir))) throw new Error(`entry must stay inside the mockup folder: ${entry}`);
    if (!fs.existsSync(f)) throw new Error(`entry ${entry} not found in ${dir}`);
    return [f];
  }
  const files = walk(dir);
  const html = files.filter((f) => HTML_EXT.has(path.extname(f).toLowerCase()));
  // A single-page export usually has index.html plus partials; prefer index files when present.
  const index = html.filter((f) => /(^|\/)index\.html?$/i.test(f));
  const pick = index.length === 1 && html.length > 1 && !looksLikeScreenSet(html) ? index : html;
  const chosen = pick.length ? pick : files.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()));
  return chosen.map((f) => path.join(dir, f));
}

// Several sibling pages (login.html, home.html, ...) are a set of screens, not one site with partials.
function looksLikeScreenSet(html) {
  const top = html.filter((f) => !f.includes('/'));
  return top.length > 1;
}

export function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

/**
 * Expand one configured mockup into screens. Zips are extracted under workDir/sources/<id>/.
 * Returns { screens, warnings }.
 */
export function expandMockup(mockup, workDir) {
  const warnings = [];
  let files;
  let root = null;
  if (mockup.kind === 'html' || mockup.kind === 'image') {
    files = [mockup.file];
  } else {
    root = mockup.kind === 'zip' ? extractZip(mockup.file, path.join(workDir, 'sources', mockup.id)) : mockup.file;
    files = screensInFolder(root, mockup.entry);
    if (!files.length) throw new Error(`No HTML pages or images found in ${mockup.file}`);
  }
  if (files.length > MAX_SCREENS_PER_SOURCE) {
    warnings.push(`${mockup.id}: ${files.length} screens found, using the first ${MAX_SCREENS_PER_SOURCE}. Set entry: to choose one page.`);
    files = files.slice(0, MAX_SCREENS_PER_SOURCE);
  }
  const screens = files.map((f, i) => {
    const kind = HTML_EXT.has(path.extname(f).toLowerCase()) ? 'html' : 'image';
    const id = files.length === 1 ? mockup.id : `${mockup.id}--${slug(root ? path.relative(root, f) : path.basename(f))}`;
    return {
      id,
      mockupId: mockup.id,
      title: files.length === 1 ? mockup.title : `${mockup.title}: ${root ? path.relative(root, f) : path.basename(f)}`,
      kind,
      source: f,
      sourceType: mockup.artifact ? 'artifact' : mockup.kind,
      artifact: mockup.artifact,
      phoneFrame: kind === 'html' ? mockup.phoneFrame : null,
      platform: mockup.platform,
      flow: mockup.flow,
      step: mockup.step ?? (files.length > 1 ? i + 1 : null),
      group: mockup.group,
      steps: mockup.steps || [],
      setup: mockup.setup || null,
      appearance: mockup.appearance || 'both',
      notes: mockup.notes,
      reference: mockup.reference,
    };
  });
  if (!mockup.states) return { screens, warnings };

  // A single-page app: one page, several states, each reached by its own steps after load.
  if (screens.length !== 1 || screens[0].kind !== 'html') {
    throw new Error(`${mockup.id}: states: need exactly one HTML page (found ${screens.length}${screens[0]?.kind === 'image' ? ' image' : ''}); set entry: to the app's page`);
  }
  const page = screens[0];
  const states = mockup.states.map((st, i) => ({
    ...page,
    id: `${mockup.id}--${st.id}`,
    title: `${mockup.title}: ${st.title}`,
    step: mockup.flow ? i + 1 : page.step,
    steps: [...page.steps, ...st.steps],
    appearance: st.appearance || page.appearance,
    notes: st.notes || page.notes,
    state: st.id,
  }));
  return { screens: states, warnings };
}
