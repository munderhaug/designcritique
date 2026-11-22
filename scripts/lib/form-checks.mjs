// Measurable questions about forms, focus order and reading ease, kept out of the page so they
// can be unit-tested. Sources: WCAG 2.2 SC 1.3.5 (identify input purpose), 2.4.3 (focus order)
// and 1.3.2 (meaningful sequence); C. H. Björnsson, Läsbarhet (Liber, 1968), the LIX index, which
// counts sentence length and long words and so works across languages written with spaces.

// What a field collects, told from its type or its id/name in the code (identifiers, not the
// interface language), and the autocomplete token and keyboard that go with it.
const PURPOSES = [
  { test: (f) => f.type === 'email' || /e-?mail/.test(f.key), token: 'email', type: 'email' },
  { test: (f) => f.type === 'tel' || /\b(phone|tel|mobile)\b|phone/.test(f.key), token: 'tel', type: 'tel' },
  { test: (f) => f.type === 'password' || /pass(word)?|pwd/.test(f.key), token: 'current-password or new-password', type: 'password' },
  { test: (f) => /(first|given|last|family|full)[-_ ]?name|\b(fname|lname)\b/.test(f.key), token: 'name, given-name or family-name', type: null },
  { test: (f) => /postal|zip/.test(f.key), token: 'postal-code', type: null },
  { test: (f) => /street|address[-_ ]?line|\baddress\b/.test(f.key), token: 'street-address', type: null },
  { test: (f) => /card[-_ ]?(number|no)|cc[-_ ]?num/.test(f.key), token: 'cc-number', type: null, numeric: true },
  { test: (f) => /\botp\b|one[-_ ]?time|verification[-_ ]?code|sms[-_ ]?code/.test(f.key), token: 'one-time-code', type: null, numeric: true },
];

/** fields: analyze-page's `fields`. Returns [{ field, purpose, missing: ['autocomplete', 'keyboard'] }]. */
export function inputPurposeProblems(fields = []) {
  const out = [];
  for (const f of fields.filter((x) => !x.hidden)) {
    const p = PURPOSES.find((x) => x.test(f));
    if (!p) continue;
    const missing = [];
    if (!f.autocomplete || /^(on|off)$/i.test(f.autocomplete)) missing.push('autocomplete');
    const wantsKeyboard = (p.type && p.type !== 'password' && f.type !== p.type) || (p.numeric && f.type === 'text');
    if (wantsKeyboard && !f.inputmode) missing.push('keyboard');
    if (missing.length) out.push({ field: f, purpose: p.token, missing });
  }
  return out;
}

/**
 * controls: analyze-page's `interactive`, in DOM order. Where does moving forward through the
 * controls jump back up the screen? Fixed bars and hidden controls are left out; a positive
 * tabindex forces an order of its own and is reported whatever the layout.
 */
export function focusOrderProblems(controls = []) {
  const flow = controls.filter((c) => !c.hidden && !c.fixed && !c.disabled && c.box.w > 0 && c.box.h > 0);
  const jumps = [];
  for (let i = 1; i < flow.length; i++) {
    const a = flow[i - 1]; const b = flow[i];
    if (b.box.y + b.box.h <= a.box.y - 8) jumps.push({ from: a, to: b });
  }
  return { jumps, forced: controls.filter((c) => !c.hidden && c.tabindex > 0) };
}

/** LIX (Björnsson 1968): words per sentence plus the share of words longer than six letters. */
export function lix(text) {
  const t = String(text || '');
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(t)) return null; // no spaces between words
  const words = t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  if (words.length < 60) return null; // too little text to say anything
  const sentences = Math.max(1, (t.match(/[.!?…]+(\s|$)|\n/g) || []).length);
  const long = words.filter((w) => w.length > 6).length;
  return { words: words.length, sentences, score: Math.round(words.length / sentences + (100 * long) / words.length) };
}
