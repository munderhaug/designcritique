// Turns a web style family's DESIGN.md into a starting point for a phone app: keeps the visual
// language that carries over (intent, colour, font families and weights, spacing scale, corner
// radii, voice) and drops what is about websites (page layout, grids and max widths, responsive
// breakpoints, web components and motion, hero type sizes, agent prompts). Layout, navigation,
// components, type sizes and motion come from the platform instead.

// Platform text styles at the default size, from the primary sources.
export const PLATFORM = {
  ios: {
    type: [11, 12, 13, 15, 16, 17, 20, 22, 28, 34],
    typeSource: 'Apple Human Interface Guidelines, Typography: Dynamic Type sizes at the default (Large) setting',
    guide: 'Apple Human Interface Guidelines: layout and safe areas, navigation bars, tab bars, sheets, lists and controls, motion',
  },
  android: {
    type: [11, 12, 14, 16, 22, 24, 28, 32, 36, 45, 57],
    typeSource: 'Material Design 3, Type scale: label, body, title, headline and display roles',
    guide: 'Material Design 3: layout and window insets, top app bars, navigation bar, components, motion',
  },
};

const KEEP = [
  ['intent', /visual theme|atmosphere|overview|intent/],
  ['colour', /colou?r|palette/],
  ['type', /typograph/],
  ['spacing', /spacing/],
  ['shape', /radius|radii|shape|corner/],
  ['voice', /voice|tone|brand|copy|content/],
];
const SIZE = /\d+(?:\.\d+)?\s*(?:px|pt|rem|em)\b|\bscale\b|line-?height|letter-?spacing|tracking/i;
const WEB = /\b(desktop|website|web ?page|landing|hero|viewport|breakpoint|max-?width|\d+-col(umn)?s?|columns? grid|grid|hover|tablet|above the fold|section(s)? (top|bottom))\b/i;
// Mood prose keeps everything but lines that are plainly about a website.
const WEB_PAGE = /\b(desktop|website|landing page|breakpoint|max-?width|viewport)\b/i;

function sections(md) {
  const out = [];
  let cur = { heading: '', lines: [] };
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(?:\d+\.\s*)?(.+)$/);
    if (h) { out.push(cur); cur = { heading: h[1].trim(), lines: [] }; continue; }
    cur.lines.push(line);
  }
  out.push(cur);
  return out;
}

/**
 * md: the style family's DESIGN.md. Returns { text, kept, dropped }: the phone-app DESIGN.md
 * body (without the attribution notice), and the section headings kept and dropped.
 */
export function mobileStartingPoint(md, platform) {
  const p = PLATFORM[platform];
  if (!p) throw new Error('platform must be ios or android');
  const [preamble, ...rest] = sections(md);
  const kept = [];
  const dropped = [];
  const parts = [];
  const radii = [];
  const spacingLines = [];
  for (const s of rest) {
    const kind = KEEP.find(([, re]) => re.test(s.heading.toLowerCase()))?.[0];
    if (!kind) {
      dropped.push(s.heading);
      // Corner radii are often given only under components; they carry over.
      for (const l of s.lines) {
        if (/radius|radii|rounded|corner/i.test(l) && /\d+\s*px/.test(l) && !WEB.test(l)) radii.push(l.trim().replace(/^[-*]\s*/, ''));
        if (/spacing scale|base unit/i.test(l) && /\d/.test(l) && !WEB.test(l)) spacingLines.push(l.trim());
      }
      continue;
    }
    let lines = s.lines;
    if (kind === 'type') {
      // Families and weights carry over; web sizes, tables and tracking don't.
      lines = lines.filter((l) => !/^\s*\|/.test(l) && !SIZE.test(l) && !WEB.test(l));
    } else if (kind === 'spacing') {
      lines = lines.filter((l) => !l.trim() || (/spacing|scale|base unit|\d/.test(l) && !WEB.test(l)));
    } else if (kind === 'intent') {
      lines = lines.filter((l) => !WEB_PAGE.test(l));
    } else if (kind !== 'colour') {
      lines = lines.filter((l) => !WEB.test(l));
    }
    if (!lines.some((l) => l.trim())) { dropped.push(s.heading); continue; }
    kept.push(s.heading);
    parts.push(`## ${s.heading}\n${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`);
  }
  if (spacingLines.length && !kept.some((h) => /spacing/i.test(h))) parts.push(`## Spacing\n\n${[...new Set(spacingLines)].join('\n')}\n`);
  if (radii.length) parts.push(`## Shape\n\nCorner radii from the original's components:\n${[...new Set(radii)].slice(0, 8).map((r) => `- ${r}`).join('\n')}\n`);
  parts.push(`## Type scale (${platform})\n\n- **Type scale:** ${p.type.join('/')}\n- Source: ${p.typeSource}. Use the platform text styles, so text follows the user's text size setting; the families above set the voice, not the sizes.\n`);
  parts.push(`## Layout, navigation, components and motion\n\nFollow the platform, not this style: ${p.guide}. This file carries only the visual language: colour, type families, spacing, shape and voice.\n`);
  const title = preamble.lines.find((l) => /^#\s/.test(l)) || '# Design system';
  const blurb = preamble.lines.filter((l) => /^>\s/.test(l) && !/category:/i.test(l)).filter((l) => !WEB.test(l));
  return { text: [title, '', ...blurb, blurb.length ? '' : null, ...parts].filter((x) => x !== null).join('\n'), kept, dropped };
}
