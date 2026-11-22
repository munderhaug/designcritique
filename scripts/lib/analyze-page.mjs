// Runs inside the browser via page.evaluate. No imports, no closures; it uses only window.__dc
// (scripts/lib/page-helpers.mjs), which preparePage installs.
// Collects what the deterministic checks need: interactive targets, text, colours, spacing, overflow.
export function analyzePage({ frameAttr }) {
  const MAX_TEXT = 800;
  const root = frameAttr ? document.querySelector(`[${frameAttr}]`) : document.documentElement;
  if (!root) return { error: 'frame not found' };
  const rootRect = root.getBoundingClientRect();
  const origin = frameAttr
    ? { x: rootRect.left, y: rootRect.top }
    : { x: -window.scrollX, y: -window.scrollY };
  const viewport = frameAttr
    ? { width: Math.round(rootRect.width), height: Math.round(rootRect.height) }
    : { width: window.innerWidth, height: window.innerHeight };

  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left - origin.x), y: Math.round(r.top - origin.y), w: Math.round(r.width), h: Math.round(r.height) };
  };

  // Shared helpers (scripts/lib/page-helpers.mjs, installed by preparePage): the composed tree, hit tests, the top modal, names.
  const { up, within, deepAll, deepHit, topModal: topModalOf, nameOf } = window.__dc;

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) === 0) return false;
    for (let p = el; p && p !== document.documentElement; p = up(p)) {
      if (parseFloat(getComputedStyle(p).opacity) === 0) return false;
    }
    return true;
  };

  const cssPath = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement && parts.length < 5; e = up(e)) {
      if (e.id && document.querySelectorAll(`#${CSS.escape(e.id)}`).length === 1) { parts.unshift(`#${CSS.escape(e.id)}`); break; }
      let part = e.tagName.toLowerCase();
      const cls = [...e.classList].filter((c) => /^[A-Za-z_-][\w-]*$/.test(c) && !c.startsWith('dc-')).slice(0, 2);
      if (cls.length) part += '.' + cls.join('.');
      const sibs = e.parentNode?.children ? [...e.parentNode.children].filter((c) => c.tagName === e.tagName) : [];
      if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(e) + 1})`;
      parts.unshift(part);
      if (e === root) break;
    }
    return parts.join(' > ');
  };

  const parseColor = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
    return { r: +r, g: +g, b: +b, a: +a };
  };
  const colorKey = (c) => {
    const p = parseColor(c);
    if (!p || p.a === 0) return null;
    const hex = '#' + [p.r, p.g, p.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    return p.a < 1 ? `${hex}@${Math.round(p.a * 100)}` : hex;
  };

  const effectiveBg = (el) => {
    for (let e = el; e; e = up(e)) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parseColor(s.backgroundColor);
      if (c && c.a >= 0.99) return colorKey(s.backgroundColor);
    }
    return '#ffffff';
  };

  const fixedAncestor = (el) => {
    for (let e = el; e && e !== root.parentElement; e = up(e)) {
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'sticky') return true;
      if (e === root) break;
    }
    return false;
  };

  const all = deepAll(root).filter((el) => !['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName));

  // Which icon a control shows: an SVG symbol it uses, a hash of its inline SVG, an image, or a
  // leading emoji. Used to find one icon with two meanings.
  const iconSignature = (el) => {
    const svg = el.querySelector('svg');
    if (svg) {
      const use = svg.querySelector('use');
      if (use) return `use:${use.getAttribute('href') || use.getAttribute('xlink:href')}`;
      const src = svg.innerHTML.replace(/\s+/g, ' ').trim();
      if (!src) return null;
      let h = 0;
      for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) | 0;
      return `svg:${(h >>> 0).toString(16)}`;
    }
    const img = el.querySelector('img');
    if (img) return `img:${(img.getAttribute('src') || '').split('/').pop().split('?')[0]}`;
    const m = (el.textContent || '').trim().match(/^\p{Extended_Pictographic}/u);
    return m ? `emoji:${m[0]}` : null;
  };

  // Can a person see it? Content under an open modal or sheet, in an inert layer, painted over by
  // an opaque surface (a sheet, the next page fading in) or parked off-screen (a stacked page
  // translated away) is in the DOM but not on the screen, so no check should measure it.
  // Hit-tested at sample points, through open shadow roots.
  const opaque = (e) => {
    const cs = getComputedStyle(e);
    const c = parseColor(cs.backgroundColor);
    return (c && c.a >= 0.9) || (cs.backgroundImage && cs.backgroundImage !== 'none') || (cs.backdropFilter && cs.backdropFilter !== 'none');
  };
  // Covered at a point: the element hit there, or one of its ancestors below the first one that
  // also holds the content, paints an opaque surface.
  const paintedOver = (el, hit) => {
    for (let e = hit; e && !within(el, e); e = up(e)) if (e.nodeType === 1 && opaque(e)) return true;
    return false;
  };
  const topModal = topModalOf();
  const inert = (el) => { for (let e = el; e; e = up(e)) if (e.nodeType === 1 && e.hasAttribute('inert')) return true; return false; };
  const scrollerOf = (el) => {
    for (let e = up(el); e && e !== document.body && e !== document.documentElement; e = up(e)) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)) return e;
    }
    return null;
  };
  /** points: [x, y] in viewport coordinates. Returns why the element can't be seen, or null. */
  const hiddenReason = (el, points) => {
    if (topModal && !within(el, topModal)) return 'under an open modal';
    if (inert(el)) return 'inert';
    const W = window.innerWidth; const H = window.innerHeight;
    let tested = 0; let shown = 0;
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const hit = deepHit(x, y);
      if (!hit) continue;
      tested++;
      if (within(hit, el) || within(el, hit) || !paintedOver(el, hit)) shown++;
    }
    if (tested) return shown ? null : 'covered';
    // Nothing of it is in the viewport. Below the fold of something that scrolls: seen once
    // scrolled to, unless that scrolling area is itself covered.
    const sc = scrollerOf(el);
    if (sc) {
      const b = sc.getBoundingClientRect();
      const cx = (Math.max(b.left, 0) + Math.min(b.right, W)) / 2; const cy = (Math.max(b.top, 0) + Math.min(b.bottom, H)) / 2;
      if (cx > 0 && cy > 0 && cx < W && cy < H) {
        const hit = deepHit(cx, cy);
        if (hit && !within(hit, sc) && !within(sc, hit) && paintedOver(sc, hit)) return 'covered';
      }
      return null;
    }
    // Off to the side of a page that doesn't scroll sideways: a page or panel parked off-screen.
    const r = el.getBoundingClientRect();
    if ((r.left >= W || r.right <= 0) && document.documentElement.scrollWidth <= W + 1) return 'off-screen';
    return null;
  };
  const rectPoints = (el) => {
    const r = el.getBoundingClientRect();
    return [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]);
  };
  const hiddenText = (el, lines) => hiddenReason(el, lines.length
    ? lines.flatMap((q) => [0.2, 0.5, 0.8].map((f) => [q.x + origin.x + q.w * f, q.y + origin.y + q.h / 2]))
    : rectPoints(el));

  const tapBox = (el) => {
    const own = box(el);
    const label = el.matches('input[type=checkbox],input[type=radio],[role=checkbox],[role=radio],[role=switch]') ? (el.labels?.[0] || el.closest('label')) : null;
    if (!label || !visible(label)) return own;
    const l = box(label);
    const x = Math.min(own.x, l.x); const y = Math.min(own.y, l.y);
    return { x, y, w: Math.max(own.x + own.w, l.x + l.w) - x, h: Math.max(own.y + own.h, l.y + l.h) - y };
  };

  // Interactive targets
  const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=radio],[role=menuitem],[role=option],[onclick],[tabindex]:not([tabindex="-1"])';
  const interactive = [];
  for (const el of deepAll(root, INTERACTIVE)) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const name = nameOf(el);
    const parentText = el.parentElement ? [...el.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0) : false;
    interactive.push({
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || null,
      type: el.getAttribute('type') || null,
      name: name.slice(0, 80),
      // What can be tapped: a checkbox or radio is tapped through its label too.
      box: tapBox(el),
      // Fixed and sticky bars stay put when the page scrolls: where they sit on the screen.
      viewY: Math.round(el.getBoundingClientRect().top),
      inlineInText: s.display === 'inline' && parentText,
      fixed: fixedAncestor(el),
      hidden: hiddenReason(el, rectPoints(el)),
      disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
      tabindex: el.hasAttribute('tabindex') ? Number(el.getAttribute('tabindex')) : null,
      style: {
        bg: colorKey(s.backgroundColor), color: colorKey(s.color),
        border: parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' ? colorKey(s.borderTopColor) : null,
        radius: Math.round(parseFloat(s.borderTopLeftRadius) || 0), weight: s.fontWeight, size: Math.round(parseFloat(s.fontSize)),
      },
      icon: iconSignature(el),
      checked: el.checked === true || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true',
    });
  }

  // Fields a person types into: what they are for, as the system can know it (WCAG 1.3.5).
  const fields = [];
  for (const el of deepAll(root, 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=range]):not([type=file]):not([type=color]):not([type=image]):not([type=reset]),textarea')) {
    if (!visible(el)) continue;
    fields.push({
      selector: cssPath(el), name: nameOf(el).slice(0, 60), type: (el.getAttribute('type') || 'text').toLowerCase(),
      inputmode: el.getAttribute('inputmode'), autocomplete: el.getAttribute('autocomplete'),
      key: `${el.id || ''} ${el.getAttribute('name') || ''}`.trim().toLowerCase(), hidden: hiddenReason(el, rectPoints(el)),
    });
  }
  // Running text, whole (the text list keeps 60 characters each): for the readability check.
  const prose = [];

  // Text, colours, spacing
  const texts = [];
  const colors = {};
  const spacing = {};
  const fontSizes = {};
  const radii = {};
  const note = (map, key, sel) => {
    if (key == null) return;
    const e = map[key] || (map[key] = { count: 0, examples: [] });
    e.count++;
    if (e.examples.length < 3 && sel && !e.examples.includes(sel)) e.examples.push(sel);
  };

  // The rendered lines of an element's own text, cut to any ancestor that clips its overflow,
  // so truncated or visually hidden text isn't counted. Used by the text-overlap check.
  const clipRect = (el) => {
    let r = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity };
    for (let a = el; a && a !== document.documentElement; a = up(a)) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || (cs.clip && cs.clip !== 'auto')) {
        const b = a.getBoundingClientRect();
        r = { l: Math.max(r.l, b.left), t: Math.max(r.t, b.top), r: Math.min(r.r, b.right), b: Math.min(r.b, b.bottom) };
      }
    }
    return r;
  };
  const textLines = (el) => {
    const c = clipRect(el);
    const out = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) {
        const l = Math.max(q.left, c.l); const t = Math.max(q.top, c.t);
        const r = Math.min(q.right, c.r); const b = Math.min(q.bottom, c.b);
        if (r - l > 2 && b - t > 2 && out.length < 8) out.push({ x: Math.round(l - origin.x), y: Math.round(t - origin.y), w: Math.round(r - l), h: Math.round(b - t) });
      }
    }
    return out;
  };

  for (const el of all) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    const isSvgShape = el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg';
    let sel = null;
    const lazySel = () => (sel ||= cssPath(el));

    if (ownText && texts.length < MAX_TEXT) {
      const fs = parseFloat(s.fontSize);
      const clippedX = el.scrollWidth > el.clientWidth + 1 && (['hidden', 'clip'].includes(s.overflowX) || s.textOverflow === 'ellipsis');
      const clippedY = el.scrollHeight > el.clientHeight + 1 && (['hidden', 'clip'].includes(s.overflowY) || (s.webkitLineClamp && s.webkitLineClamp !== 'none'));
      texts.push({
        selector: lazySel(),
        text: ownText.replace(/\s+/g, ' ').slice(0, 60),
        fontSize: fs,
        fontWeight: s.fontWeight,
        fontFamily: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        color: colorKey(s.color),
        background: effectiveBg(el),
        box: box(el),
        clipped: clippedX || clippedY,
        lines: textLines(el),
        fixed: fixedAncestor(el),
      });
      const t = texts[texts.length - 1];
      t.hidden = hiddenText(el, t.lines);
      if (!t.hidden && prose.length < 60 && ownText.split(/\s+/).length >= 8) prose.push(ownText.replace(/\s+/g, ' ').slice(0, 800));
      note(colors, colorKey(s.color), lazySel());
      note(fontSizes, `${Math.round(fs * 10) / 10}`, lazySel());
    }
    if (el === document.body || el === document.documentElement) continue;
    note(colors, colorKey(s.backgroundColor), colorKey(s.backgroundColor) ? lazySel() : null);
    if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') note(colors, colorKey(s.borderTopColor), lazySel());
    if (isSvgShape) {
      if (s.fill && s.fill !== 'none') note(colors, colorKey(s.fill), lazySel());
      if (s.stroke && s.stroke !== 'none') note(colors, colorKey(s.stroke), lazySel());
    }
    for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'rowGap', 'columnGap']) {
      const v = parseFloat(s[prop]);
      if (v > 0 && Number.isFinite(v)) note(spacing, `${Math.round(v * 10) / 10}`, lazySel());
    }
    const r = parseFloat(s.borderTopLeftRadius);
    if (r > 0) note(radii, `${Math.round(r * 10) / 10}`, lazySel());
  }

  // Horizontal overflow: report the outermost elements that run past the right edge.
  const scrollWidth = frameAttr ? root.scrollWidth : document.documentElement.scrollWidth;
  const clientWidth = frameAttr ? root.clientWidth : window.innerWidth;
  const overflowing = [];
  if (scrollWidth > clientWidth + 1) {
    const right = viewport.width + 1;
    const offenders = all.filter((el) => visible(el) && box(el).x + box(el).w > right);
    const set = new Set(offenders);
    for (const el of offenders) {
      if (!set.has(el.parentElement)) overflowing.push({ selector: cssPath(el), box: box(el) });
      if (overflowing.length >= 5) break;
    }
  }

  // Looping motion (WCAG 2.2.2). Capture freezes animation timing, but the computed iteration
  // count survives, so an infinite animation is still visible here. Loading indicators are
  // exempt: a progressbar, a busy region, or a status region.
  const looping = [];
  const busy = (el) => !!el.closest('[role=progressbar],[aria-busy=true],[role=status],progress');
  const labelOf = (el) => (el.getAttribute('aria-label') || el.closest('[aria-label]')?.getAttribute('aria-label') || el.textContent || el.parentElement?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  for (const el of all) {
    const s = getComputedStyle(el);
    const infinite = s.animationName && s.animationName !== 'none' && s.animationIterationCount.split(',').some((c) => c.trim() === 'infinite');
    const svgLoop = el.tagName.toLowerCase().startsWith('animate') && el.getAttribute('repeatCount') === 'indefinite';
    const marquee = el.tagName === 'MARQUEE';
    if (!infinite && !svgLoop && !marquee) continue;
    const target = svgLoop ? (el.closest('svg') || el.parentElement) : el;
    if (!visible(target)) continue;
    looping.push({ selector: cssPath(target), box: box(target), animation: svgLoop ? 'svg animate' : marquee ? 'marquee' : s.animationName, label: labelOf(target), busy: busy(target), fixed: fixedAncestor(target) });
    if (looping.length >= 20) break;
  }

  // Controls hidden under fixed or sticky content (tab bars, headers, floating buttons) even
  // when scrolled as far as the page allows (WCAG 2.4.11, platform safe layout). Each control is
  // scrolled to the middle of the screen, then hit-tested. An overlay covering most of the screen
  // (a dialog's scrim) hides what's behind it on purpose and is ignored.
  const obscured = [];
  if (!frameAttr) {
    const scrollers = all.filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map((e) => [e, e.scrollTop, e.scrollLeft]);
    const winX = window.scrollX; const winY = window.scrollY;
    const vw = window.innerWidth; const vh = window.innerHeight;
    const fixedRoot = (el) => {
      let found = null;
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        const p = getComputedStyle(e).position;
        if (p === 'fixed' || p === 'sticky') found = e;
      }
      return found;
    };
    const candidates = deepAll(root, INTERACTIVE).filter((el) => visible(el) && !fixedAncestor(el) && !el.closest('[aria-hidden=true],[inert]') && !(topModal && !within(el, topModal)) && !inert(el)).slice(0, 150);
    for (const el of candidates) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      const points = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]
        .map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < vw && y < vh);
      if (!points.length) continue;
      let covered = 0; let by = null; let centreCovered = false;
      points.forEach(([x, y], i) => {
        const top = document.elementFromPoint(x, y);
        if (!top || top === el || el.contains(top) || top.contains(el)) return;
        const cover = fixedRoot(top);
        if (!cover) return;
        const cr = cover.getBoundingClientRect();
        if (cr.width * cr.height > vw * vh * 0.4) return;
        covered++;
        if (i === 0) centreCovered = true;
        by = by || cover;
      });
      if (!centreCovered) continue;
      const s = getComputedStyle(el);
      const filled = parseColor(s.backgroundColor)?.a >= 0.99 && colorKey(s.backgroundColor) !== effectiveBg(el.parentElement || document.body);
      let name = el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || '';
      obscured.push({ selector: cssPath(el), tag: el.tagName.toLowerCase(), name: name.trim().replace(/\s+/g, ' ').slice(0, 80), entirely: covered === points.length, filled, by: cssPath(by), byBox: box(by) });
      if (obscured.length >= 10) break;
    }
    for (const [e, t, l] of scrollers) { e.scrollTop = t; e.scrollLeft = l; }
    window.scrollTo(winX, winY);
  }

  const hasViewportMeta = !!document.querySelector('meta[name=viewport]');
  // Pages that pad with env(safe-area-inset-*) handle insets themselves, but a desktop browser
  // reports those insets as 0, so the safe-area check can't judge them from a render.
  let safeAreaCss = false;
  const hasInset = (t) => /env\(\s*safe-area-inset-/i.test(t || '');
  for (const sheet of document.styleSheets) {
    try { for (const rule of sheet.cssRules) if (hasInset(rule.cssText)) { safeAreaCss = true; break; } } catch { /* cross-origin sheet */ }
    if (safeAreaCss) break;
  }
  if (!safeAreaCss) safeAreaCss = [...document.querySelectorAll('[style]')].some((el) => hasInset(el.getAttribute('style')));
  const viewportFitCover = /viewport-fit\s*=\s*cover/i.test(document.querySelector('meta[name=viewport]')?.content || '');
  return {
    viewport,
    scrollWidth,
    scrollHeight: frameAttr ? root.scrollHeight : document.documentElement.scrollHeight,
    hasViewportMeta,
    lang: document.documentElement.lang || null,
    pageBg: effectiveBg(document.body),
    safeAreaCss,
    viewportFitCover,
    title: document.title || null,
    interactive,
    fields,
    prose,
    texts,
    colors,
    spacing,
    fontSizes,
    radii,
    overflowing,
    looping,
    obscured,
  };
}
