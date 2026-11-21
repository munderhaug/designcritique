// Helpers every in-page script shares (page analysis, the crawler's control list, state titles),
// installed once per page as window.__dc so the rules can't drift apart: how to walk the composed
// tree (open shadow roots included), what is hit at a point, which modal is on top, and a
// control's accessible name.
export function pageHelpers() {
  if (window.__dc) return;
  const up = (n) => n.parentElement || (n.parentNode instanceof ShadowRoot ? n.parentNode.host : null);
  const within = (n, anc) => { for (let e = n; e; e = up(e)) if (e === anc) return true; return false; };
  const deepAll = (node, sel, out = []) => {
    for (const el of node.querySelectorAll('*')) {
      if (!sel || el.matches(sel)) out.push(el);
      if (el.shadowRoot) deepAll(el.shadowRoot, sel, out);
    }
    return out;
  };
  const deepHit = (x, y) => {
    let e = document.elementFromPoint(x, y);
    while (e && e.shadowRoot) { const inner = e.shadowRoot.elementFromPoint(x, y); if (!inner || inner === e) break; e = inner; }
    return e;
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  // The open modal dialog or sheet on top, if any: only what is inside it can be seen or tapped.
  const topModal = () => {
    const list = [...document.querySelectorAll('[aria-modal=true],dialog[open]')].filter((d) => shown(d) && (d.getAttribute('aria-modal') === 'true' || d.matches(':modal')));
    return list[list.length - 1] || null;
  };
  const text = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  // aria-label, aria-labelledby, its <label>, its text, then title, an image's alt, its value.
  // A native control inside a web component is named by what is slotted into its host.
  const nameOf = (el) => {
    const root = el.getRootNode();
    const own = text(el.getAttribute('aria-label')
      || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => (root.getElementById?.(id) || document.getElementById(id))?.textContent || '').join(' ')
      || el.labels?.[0]?.textContent || el.innerText || el.getAttribute('alt') || el.querySelector('img[alt]')?.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('placeholder') || el.value || '');
    if (own || !(root instanceof ShadowRoot)) return own;
    const host = root.host;
    return text(host.getAttribute('aria-label') || host.innerText || host.getAttribute('title') || '');
  };
  window.__dc = { up, within, deepAll, deepHit, shown, topModal, nameOf, text };
}

/** Install the helpers on a page now and on every document it loads later. */
export async function installPageHelpers(page) {
  await page.addInitScript(pageHelpers).catch(() => {});
  await page.evaluate(pageHelpers).catch(() => {});
}
