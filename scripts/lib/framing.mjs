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

/**
 * The product's name for report titles: the title line unless it is the schema's generic
 * "# Product", else a "## Name" section or a "Name:" line, else the name that opens the first
 * paragraph or Product Purpose ("Acme: a …", "Acme — a …"). Null when PRODUCT.md doesn't say.
 */
export function productName(md) {
  const ok = (v) => { const t = String(v || '').replace(/[*_`]/g, '').trim(); return t && !t.startsWith('<') && t.length <= 60 ? t : null; };
  const h1 = titleOf(md);
  if (h1 && !/^product$/i.test(h1.trim())) return ok(h1);
  const named = ok((section(md, 'Name') || section(md, 'Product name')).split('\n')[0]);
  if (named) return named;
  const text = stripComments(md);
  const line = text.match(/^\s*[-*]?\s*\**(?:Product name|Name)\**\s*:\s*(.+)$/mi);
  if (line && ok(line[1])) return ok(line[1]);
  const intro = (text.split(/^##\s/m)[0].replace(/^#.*$/m, '').trim().split(/\n\s*\n/)[0] || '');
  for (const body of [intro, section(md, 'Product Purpose')]) {
    const m = String(body).match(/^\**([\p{Lu}\p{N}][\p{L}\p{N} .&'+-]{0,40}?)\**\s*(?::|\s[—–]\s)/u);
    if (m && ok(m[1])) return ok(m[1]);
  }
  return null;
}

/**
 * Sections the critique judges against that are missing, empty or still hold the template's
 * <placeholder> text. An empty list means the frame is filled in.
 */
export function unfilledSections(md) {
  const placeholder = /<[A-Z][^<>\n]*>|When …, I want to …/;
  return [['Users', 'Users'], ['Problem', 'Problem'], ['Key Tasks', 'Key tasks']]
    .filter(([, name]) => { const body = section(md, name); return !body || placeholder.test(body); })
    .map(([label]) => label);
}

export const unfilledMessage = (names) =>
  `PRODUCT.md is not filled in (${names.join(', ')}): run the frame skill, or the critique has no problem, user or key tasks to judge against.`;
