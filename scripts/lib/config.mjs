// Shared config loading for designcritique scripts.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const DEVICE_PRESETS = {
  ios: {
    compact: { name: 'iPhone SE', width: 375, height: 667, safeTop: 20, safeBottom: 0 },
    standard: { name: 'iPhone 16', width: 393, height: 852, safeTop: 59, safeBottom: 34 },
  },
  android: {
    compact: { name: 'Android compact', width: 360, height: 800, safeTop: 24, safeBottom: 24 },
    standard: { name: 'Pixel 9', width: 412, height: 915, safeTop: 24, safeBottom: 24 },
  },
};

export const MIN_TARGET = { ios: 44, android: 48 };
export const MIN_TEXT = { ios: 11, android: 12 };

export const DEFAULT_VARIANTS = ['light', 'dark', 'large-text'];
export const DEFAULT_DEVICES = ['compact', 'standard'];

export const HTML_EXT = new Set(['.html', '.htm']);
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/** Where the critique skill saves Claude artifacts it pulls in, relative to the config. */
export const SOURCES_DIR = '.designcritique/sources';

export function loadConfig(configPath) {
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) throw new Error(`Config not found: ${abs}`);
  const raw = YAML.parse(fs.readFileSync(abs, 'utf8')) || {};
  const baseDir = path.dirname(abs);
  const rel = (p) => (p ? path.resolve(baseDir, p) : null);

  const platform = normalizePlatform(raw.platform || 'ios');
  const cfg = {
    configPath: abs,
    baseDir,
    platform,
    product: rel(raw.product),
    design: rel(raw.design),
    references: (raw.references || []).map(rel),
    devices: raw.devices || DEFAULT_DEVICES,
    variants: raw.variants || DEFAULT_VARIANTS,
    requires: { darkMode: false, ...(raw.requires || {}) },
    taste: expandImages(raw.taste, baseDir),
    critics: normalizeCritics(raw.critics),
    gate: normalizeGate(raw.gate),
    iterate: { max_rounds: Number(raw.iterate?.max_rounds ?? 3) },
    output: rel(raw.output || '.designcritique/runs'),
    mockups: [],
  };

  const seen = new Set();
  for (const m of raw.mockups || []) {
    if (!m.id) throw new Error(`Each mockup needs an id: ${JSON.stringify(m)}`);
    if (!/^[A-Za-z0-9_-]+$/.test(m.id)) throw new Error(`Mockup id may use letters, digits, - and _ only: ${m.id}`);
    if (seen.has(m.id)) throw new Error(`Duplicate mockup id: ${m.id}`);
    seen.add(m.id);

    let file = rel(m.file);
    // A Claude artifact is pulled into SOURCES_DIR/<id>/ by the critique skill before capture.
    if (!file && m.artifact) {
      const pulled = path.join(baseDir, SOURCES_DIR, m.id);
      if (!fs.existsSync(pulled)) {
        throw new Error(
          `Mockup ${m.id} points at artifact ${m.artifact}, but it has not been pulled in yet. ` +
          `Run /designcritique:critique (it saves artifacts to ${SOURCES_DIR}/${m.id}/), ` +
          `or export the artifact (HTML, .zip or PNG) and set file: instead.`);
      }
      file = pulled;
    }
    if (!file) throw new Error(`Mockup ${m.id} needs file: (html, image, .zip or folder) or artifact: (a claude.ai link)`);
    if (!fs.existsSync(file)) throw new Error(`Mockup file missing for ${m.id}: ${file}`);

    cfg.mockups.push({
      id: m.id,
      title: m.title || m.id,
      file,
      kind: kindOf(file),
      artifact: m.artifact || null,
      entry: m.entry || null,
      phoneFrame: m.phone_frame || null,
      platform: normalizePlatform(m.platform || platform),
      flow: m.flow || null,
      step: m.step ?? null,
      group: m.group || null,
      states: m.states || null,
      notes: m.notes || null,
      reference: rel(m.reference),
    });
  }
  if (!cfg.mockups.length) throw new Error('No mockups listed in config');
  return cfg;
}

export const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];
export const DEFAULT_GATE = { fail_on: 'P1', target_score: 8 };

/** taste: a folder or a list of images (the 9-12 references you chose), resolved to image files. */
export function expandImages(spec, baseDir) {
  if (!spec) return [];
  const out = [];
  for (const item of Array.isArray(spec) ? spec : [spec]) {
    const abs = path.resolve(baseDir, String(item));
    if (!fs.existsSync(abs)) throw new Error(`taste: not found: ${abs}`);
    if (fs.statSync(abs).isDirectory()) {
      for (const f of fs.readdirSync(abs).sort()) if (IMAGE_EXT.has(path.extname(f).toLowerCase())) out.push(path.join(abs, f));
    } else if (IMAGE_EXT.has(path.extname(abs).toLowerCase())) out.push(abs);
    else throw new Error(`taste: ${abs} is not an image (.png, .jpg, .webp) or folder`);
  }
  return out;
}

function normalizeCritics(raw = {}) {
  const external = raw.external || [];
  if (!Array.isArray(external) || external.some((e) => !/^[a-z0-9-]+$/.test(String(e)))) {
    throw new Error('critics.external must be a list of names (lowercase letters, digits, -), e.g. [codex]');
  }
  return { judge_model: raw.judge_model ? String(raw.judge_model) : null, external: external.map(String) };
}

export function normalizeGate(raw = {}) {
  const gate = { ...DEFAULT_GATE, ...(raw || {}) };
  if (!SEVERITIES.includes(gate.fail_on) && gate.fail_on !== 'none') throw new Error(`gate.fail_on must be P0-P3 or none (got ${gate.fail_on})`);
  gate.target_score = gate.target_score == null ? null : Number(gate.target_score);
  if (gate.target_score != null && !(gate.target_score >= 0 && gate.target_score <= 10)) throw new Error('gate.target_score must be 0-10');
  return gate;
}

export function kindOf(file) {
  if (fs.statSync(file).isDirectory()) return 'dir';
  const ext = path.extname(file).toLowerCase();
  if (HTML_EXT.has(ext)) return 'html';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (ext === '.zip') return 'zip';
  throw new Error(`Unsupported mockup type ${ext} (${file}); use .html, .png/.jpg/.webp, .zip or a folder`);
}

function normalizePlatform(p) {
  const v = String(p).toLowerCase();
  if (['ios', 'android', 'adaptive'].includes(v)) return v;
  throw new Error(`platform must be ios, android or adaptive (got ${p})`);
}

/** Platforms to render a mockup for. Adaptive mockups are checked against both. */
export function platformsFor(screen) {
  return screen.platform === 'adaptive' ? ['ios', 'android'] : [screen.platform];
}

export function readJson(p, fallback = undefined) {
  if (!fs.existsSync(p)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing file: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

export function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function slug(s) {
  return String(s).replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'screen';
}
