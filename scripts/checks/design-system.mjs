// Design-system checks on DESIGN.md itself (not on screens). Based on the "eight essentials"
// of the Smpl design-system guide and DESIGN.md / Material colour roles; IDs in
// skills/principles/references/design-systems.md.
import { contrastRatio } from '../lib/tokens.mjs';

const ROLE_GROUPS = {
  surface: /^(dark-)?(surface|background|bg|canvas)$/,
  text: /^(dark-)?(on-surface|on-background|text|foreground|fg|ink)$/,
  action: /^(dark-)?(primary|accent|action|brand|interactive)$/,
  error: /^(dark-)?(error|danger|warning|destructive|critical)$/,
};

const ESSENTIALS = {
  buttons: /\bbutton/i,
  forms: /\b(form|input|text field|field|label)/i,
  navigation: /\b(navigation|tab bar|nav bar|navigation bar|back button|search)/i,
  'empty and error states': /\b(empty state|zero state|error state|error message)/i,
  voice: /\b(voice|tone|microcopy|copy)\b/i,
};

/** Returns findings with screen "*". */
export function designSystemFindings(tokens, designPath) {
  const out = [];
  const base = { screen: '*', mockup: null, platform: null, source: 'check', confidence: 'high' };
  const names = [...tokens.colorByName.keys()];

  // DS-CONTRAST: every on-X token against X (same mode), and on-surface* against surface containers.
  const pairs = [];
  for (const name of names) {
    const m = name.match(/^(dark-)?on-(.+)$/);
    if (!m) continue;
    const mode = m[1] || '';
    const role = m[2];
    const bases = new Set();
    const direct = `${mode}${role.replace(/-variant$/, '')}`;
    if (tokens.colorByName.has(direct)) bases.add(direct);
    if (/^surface/.test(role)) for (const n of names) if (n.startsWith(`${mode}surface`) && !n.startsWith(`${mode}on-`)) bases.add(n);
    for (const b of bases) pairs.push([name, b]);
  }
  const failing = pairs.map(([fg, bg]) => ({ fg, bg, ratio: contrastRatio(tokens.colorByName.get(fg), tokens.colorByName.get(bg)) }))
    .filter((p) => p.ratio < 4.5);
  if (failing.length) {
    const worst = Math.min(...failing.map((p) => p.ratio));
    out.push({
      ...base, id: 'chk-ds-contrast', rule: 'CHK-DS-CONTRAST', basis: ['DS-CONTRAST', 'WCAG-1.4.3'], category: 'color',
      severity: worst < 3 ? 'P1' : 'P2',
      title: `${failing.length} text/surface token pair(s) below 4.5:1`,
      element: null,
      evidence: failing.slice(0, 6).map((p) => `${p.fg} on ${p.bg}: ${p.ratio.toFixed(2)}:1`).join('\n') + `\n(${designPath})`,
      recommendation: 'Fix the tokens, not each screen: adjust the role colours in DESIGN.md until every text role reaches 4.5:1 on every surface it is used on (3:1 for large text only).',
    });
  } else if (!pairs.length) {
    out.push({
      ...base, id: 'chk-ds-pairs', rule: 'CHK-DS-ROLES', basis: ['DS-ROLES'], category: 'tokens', severity: 'P3',
      title: 'No on-colour roles to check contrast against',
      element: null,
      evidence: `DESIGN.md has no "on-…" colour roles (e.g. on-surface, on-primary), so token contrast can't be verified.`,
      recommendation: 'Name colours by role with matching on-colours (surface / on-surface, primary / on-primary), as Material 3 and DESIGN.md do.',
    });
  }

  // DS-ROLES: the four role groups exist.
  const missing = Object.entries(ROLE_GROUPS).filter(([, re]) => !names.some((n) => re.test(n))).map(([g]) => g);
  if (missing.length) {
    out.push({
      ...base, id: 'chk-ds-roles', rule: 'CHK-DS-ROLES', basis: ['DS-ROLES'], category: 'tokens', severity: 'P2',
      title: `Colour roles missing: ${missing.join(', ')}`,
      element: null,
      evidence: `Colour tokens found: ${names.slice(0, 12).join(', ')}${names.length > 12 ? ', …' : ''}.`,
      recommendation: 'Give colours jobs: surface, text (on-surface), action (primary) and error/warning, each with a dark value.',
    });
  }

  // DS-SCALE: spacing is 4-based.
  const offGrid = tokens.spacing.filter((v) => v > 4 && v % 4 !== 0);
  if (offGrid.length) {
    out.push({
      ...base, id: 'chk-ds-scale', rule: 'CHK-DS-SCALE', basis: ['DS-SCALE'], category: 'tokens', severity: 'P3',
      title: `Spacing scale is not 4-based (${offGrid.join(', ')})`,
      element: null,
      evidence: `Spacing tokens: ${tokens.spacing.join(', ')}.`,
      recommendation: 'Use one 4- or 8-based scale; every gap and padding comes from it.',
    });
  }
  if (tokens.fontFamilies.length > 2) {
    out.push({
      ...base, id: 'chk-ds-fonts', rule: 'CHK-DS-SCALE', basis: ['DS-SCALE', 'VIS-TYPE'], category: 'typography', severity: 'P3',
      title: `${tokens.fontFamilies.length} font families defined`,
      element: null,
      evidence: `Families: ${tokens.fontFamilies.join(', ')}.`,
      recommendation: 'Two families at most (often one plus a monospace); decide the type scale once.',
    });
  }

  // DS-ESSENTIALS: documented beyond tokens.
  const text = tokens.body || '';
  const undocumented = Object.entries(ESSENTIALS).filter(([, re]) => !re.test(text)).map(([k]) => k);
  if (!tokens.fontSizes.length) undocumented.unshift('type scale');
  if (!tokens.spacing.length) undocumented.unshift('spacing scale');
  if (undocumented.length) {
    out.push({
      ...base, id: 'chk-ds-essentials', rule: 'CHK-DS-ESSENTIALS', basis: ['DS-ESSENTIALS'], category: 'tokens', severity: 'P3',
      title: `Design system silent on: ${undocumented.join(', ')}`,
      element: null,
      evidence: `${designPath} has no guidance on ${undocumented.join(', ')}. Screens will improvise them.`,
      recommendation: 'Add short rules for each: button hierarchy and states (hover, focus, disabled, loading), form labels/help/errors, where navigation and back live, empty and error states, and the voice of labels and messages.',
    });
  }
  return out;
}
