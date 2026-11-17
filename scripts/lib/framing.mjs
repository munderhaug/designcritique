// Reading PRODUCT.md (the problem frame) for reports and recommendations. HTML comments are
// template guidance, not content, so they are removed before anything is read.
export const stripComments = (md) => String(md || '').replace(/<!--[\s\S]*?-->/g, '');

/** The body of a "## Name" section (first match, case-insensitive), without comments. */
export function section(md, name) {
  const text = stripComments(md);
  const m = text.match(new RegExp(`^##\\s+${name}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi'));
  return m ? m[1].trim() : '';
}

/** Each [assumption] line plus its wrapped continuation lines (up to a blank line, list item or heading). */
export function assumptionsOf(md) {
  const lines = stripComments(md).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\[assumption\]/i.test(lines[i])) continue;
    let text = lines[i].replace(/^\s*([-*]|\d+\.)\s*/, '').trim();
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*([-*]|\d+\.)\s/.test(lines[i + 1]) && !/^#/.test(lines[i + 1])) text += ' ' + lines[++i].trim();
    if (text) out.push(text);
  }
  return out;
}

export const titleOf = (md) => (stripComments(md).match(/^#\s+(.+)$/m) || [])[1] || null;
