#!/usr/bin/env node
// Finds companion skills that designcritique can use when they are installed.
// Prints JSON: { name: { found: bool, path, use, install } }.
//
// Usage: node scripts/companions.mjs [--project <dir>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from './lib/config.mjs';

const args = parseArgs(process.argv.slice(2));
const project = path.resolve(args.project || process.cwd());
const home = os.homedir();

// Where Claude Code and the `skills` CLI put skills, project first.
const roots = [
  path.join(project, '.claude', 'skills'),
  path.join(project, '.agents', 'skills'),
  path.join(home, '.claude', 'skills'),
  path.join(home, '.agents', 'skills'),
  path.join(home, '.claude', 'plugins'),
];

export const COMPANIONS = {
  'design-critique': {
    skill: 'design-critique',
    use: 'Core: the design-reviewer agent follows this framework (Anthropic design plugin).',
    install: 'claude plugin marketplace add anthropics/knowledge-work-plugins && claude plugin install design@knowledge-work-plugins',
    by: 'Anthropic, official',
  },
  'accessibility-review': {
    skill: 'accessibility-review',
    use: 'Core: WCAG review method for the design-reviewer agent (Anthropic design plugin).',
    install: 'claude plugin marketplace add anthropics/knowledge-work-plugins && claude plugin install design@knowledge-work-plugins',
    by: 'Anthropic, official',
  },
  'ux-copy': {
    skill: 'ux-copy',
    use: 'Core: copy review patterns for the design-reviewer agent (Anthropic design plugin).',
    install: 'claude plugin marketplace add anthropics/knowledge-work-plugins && claude plugin install design@knowledge-work-plugins',
    by: 'Anthropic, official',
  },
  impeccable: {
    skill: 'impeccable',
    use: 'Core: init writes PRODUCT.md (frame skill); critique is one of the two critics.',
    install: 'npx impeccable install -y --providers=claude --scope=project',
    by: 'Paul Bakaus (pbakaus/impeccable), Apache-2.0',
  },
  'material-3': {
    skill: 'material-3',
    use: 'Android screens: give the ui critic its Material 3 guidance and compliance audit.',
    install: 'npx skills add hamen/material-3-skill --skill material-3 -a claude-code',
    by: 'hamen/material-3-skill, MIT',
  },
  'platform-audit': {
    skill: 'ui-design',
    match: (p) => /designer-skills/i.test(p),
    use: 'iOS and Android screens: give the ui critic its platform-audit and responsive-audit commands as companion guidance.',
    install: '/plugin marketplace add Owl-Listener/designer-skills  then  /plugin install ui-design@designer-skills',
    by: 'Owl-Listener/designer-skills, MIT',
  },
  'expo-design-system': {
    skill: 'expo-design-system',
    use: 'Expo / React Native projects: design-system drift and "looks AI-generated" audit guidance for the ui critic.',
    install: 'claude plugin install expo@claude-plugins-official',
    by: 'Expo team, official',
  },
  'expo-native-ui': {
    skill: 'expo-native-ui',
    use: 'Expo / React Native projects on iOS: native styling guidance (HIG, semantic colours, SF Symbols) for the ui critic.',
    install: 'claude plugin install expo@claude-plugins-official',
    by: 'Expo team, official',
  },
  'transitions-dev': {
    skill: 'transitions-dev',
    use: 'HTML prototypes: motion recipes and tokens when fixing motion findings (web only).',
    install: 'npx skills add Jakubantalik/transitions.dev',
    by: 'Jakub Antalik (transitions.dev)',
  },
  'transitions-polish': {
    skill: 'transitions-polish',
    use: 'HTML prototypes: motion-token polish rules when fixing motion findings (web only).',
    install: 'npx skills add Jakubantalik/transitions.dev',
    by: 'Jakub Antalik (transitions.dev)',
  },
  'swiftui-specialist': {
    skill: 'swiftui-specialist',
    use: 'SwiftUI source code (next version, running apps): Apple\'s own guidance. Not used for HTML or image mockups.',
    install: 'xcrun agent skills export ~/.claude/skills   (needs Xcode 27)',
    by: 'Apple, official (Xcode 27)',
  },
};

function findSkill(name, match, depthLimit = 7) {
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > depthLimit || hits.length) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.name === name && fs.existsSync(path.join(full, 'SKILL.md')) && (!match || match(full))) { hits.push(path.join(full, 'SKILL.md')); return; }
      walk(full, depth + 1);
    }
  };
  for (const r of roots) { if (fs.existsSync(r)) walk(r, 0); if (hits.length) break; }
  return hits[0] || null;
}

const out = {};
for (const [key, c] of Object.entries(COMPANIONS)) {
  const p = findSkill(c.skill, c.match);
  out[key] = { found: !!p, path: p, use: c.use, install: c.install, by: c.by };
}
console.log(JSON.stringify(out, null, 2));
