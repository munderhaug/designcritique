// Third-party design-system corpus used for evals and style starting points: open-design
// (nexu-io, Apache-2.0), pinned to one commit. Fetched on demand into a gitignored cache;
// never copied into this repository.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const OPEN_DESIGN = {
  repo: 'https://github.com/nexu-io/open-design.git',
  commit: 'f2ecaa3f88e1eba001379ea845e7b7754310ea6d',
  dir: 'design-systems',
  license: 'Apache-2.0',
  by: 'nexu-io',
};

const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });

/** Path to design-systems/ at the pinned commit: --dir if given, else the cache, fetched if missing. */
export function openDesignSystems(root, dirArg) {
  if (dirArg) {
    const d = path.resolve(dirArg);
    return fs.existsSync(path.join(d, OPEN_DESIGN.dir)) ? path.join(d, OPEN_DESIGN.dir) : d;
  }
  const cache = path.join(root, 'evals', '.cache', `open-design-${OPEN_DESIGN.commit.slice(0, 7)}`);
  const target = path.join(cache, OPEN_DESIGN.dir);
  if (fs.existsSync(target)) return target;
  fs.mkdirSync(cache, { recursive: true });
  for (const args of [['init', '-q'], ['remote', 'add', 'origin', OPEN_DESIGN.repo], ['sparse-checkout', 'set', OPEN_DESIGN.dir], ['fetch', '-q', '--depth', '1', 'origin', OPEN_DESIGN.commit], ['checkout', '-q', 'FETCH_HEAD']]) {
    const r = git(cache, ...args);
    if (r.status !== 0) throw new Error(`git ${args[0]} failed for ${OPEN_DESIGN.repo}@${OPEN_DESIGN.commit.slice(0, 7)}: ${(r.stderr || '').trim().split('\n')[0]}`);
  }
  return target;
}

/** Every system's DESIGN.md: [{ id, file }]. */
export function designFiles(systemsDir) {
  return fs.readdirSync(systemsDir).sort()
    .map((id) => ({ id, file: path.join(systemsDir, id, 'DESIGN.md') }))
    .filter((x) => fs.existsSync(x.file));
}

// The corpus mixes style families (a look anyone may use) with systems "inspired by" a named
// company. Only style families are offered as starting points; brand systems stay eval data.
const BRAND_TITLE = /^#\s+design system (?:inspired by|for|of)\s+/im;
export function isBrandSystem(text) {
  return BRAND_TITLE.test(text) || /\b(inspired by|based on) [A-Z][\w.&-]+(?:'s)? (?:website|app|brand|product|design)/.test(text.slice(0, 1500));
}
