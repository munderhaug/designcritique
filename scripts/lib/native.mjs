// A native app's screen, read from its accessibility hierarchy, in the shape the checks read
// (scripts/lib/analyze-page.mjs produces the same for HTML): controls with a name, a role and
// a box in points or dp. The hierarchy comes from `maestro hierarchy` (mobile.dev, Apache-2.0):
// a tree of { attributes: { bounds: "[l,t][r,b]", text, accessibilityText, hintText,
// resource-id, class, clickable, enabled, … }, children }. Experimental: the adapter is tested
// on recorded hierarchies; the driver around it (scripts/capture/native.mjs) needs a simulator
// or emulator and has not been run in this repository's own environment.

/** "[0,66][1080,210]" → { x, y, w, h } in the device's pixels. */
export function parseBounds(b) {
  if (b && typeof b === 'object') return { x: b.x ?? b.left ?? 0, y: b.y ?? b.top ?? 0, w: b.width ?? (b.right - b.left) ?? 0, h: b.height ?? (b.bottom - b.top) ?? 0 };
  const m = String(b || '').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
  return m ? { x: +m[1], y: +m[2], w: +m[3] - +m[1], h: +m[4] - +m[2] } : null;
}
const flag = (node, key) => { const v = node[key] ?? node.attributes?.[key]; return v === true || v === 'true'; };
const attr = (node, key) => String(node.attributes?.[key] ?? '').trim();
const textsUnder = (node, out = []) => { const t = attr(node, 'text') || attr(node, 'accessibilityText'); if (t) out.push(t); for (const c of node.children || []) textsUnder(c, out); return out; };

/**
 * tree: the parsed output of `maestro hierarchy`. scale: device pixels per point or dp
 * (Android: density / 160; iOS hierarchies are already in points, so 1).
 */
export function hierarchyToData(tree, { scale = 1 } = {}) {
  const px = (v) => Math.round(v / scale);
  const box = (b) => ({ x: px(b.x), y: px(b.y), w: px(b.w), h: px(b.h) });
  const root = parseBounds(tree?.attributes?.bounds) || (tree?.children || []).map((c) => parseBounds(c.attributes?.bounds)).filter(Boolean).sort((a, b) => b.w * b.h - a.w * a.h)[0] || { x: 0, y: 0, w: 0, h: 0 };
  const interactive = [];
  const texts = [];
  const visit = (node, path, insideControl) => {
    const b = parseBounds(node.attributes?.bounds);
    const cls = attr(node, 'class') || attr(node, 'type') || 'element';
    const here = `${path}/${cls.split('.').pop()}`;
    const clickable = flag(node, 'clickable') && b && b.w > 0 && b.h > 0;
    if (clickable && !insideControl) {
      // Its name: what a screen reader would say, else the text it contains.
      const own = attr(node, 'accessibilityText') || attr(node, 'text') || attr(node, 'hintText');
      const name = (own || textsUnder(node).join(' ')).replace(/\s+/g, ' ').trim().slice(0, 80);
      interactive.push({
        selector: attr(node, 'resource-id') || here, tag: cls.split('.').pop().toLowerCase(), role: null, type: null,
        name, labelled: !!(attr(node, 'accessibilityText') || textsUnder(node).length), box: box(b), inlineInText: false, fixed: false, hidden: null,
        disabled: node.enabled === false || node.attributes?.enabled === 'false', checked: flag(node, 'checked') || flag(node, 'selected'),
      });
    }
    const t = attr(node, 'text');
    if (t && b) texts.push({ selector: attr(node, 'resource-id') || here, text: t.slice(0, 60), box: box(b), hidden: null });
    (node.children || []).forEach((c, i) => visit(c, `${here}[${i}]`, insideControl || clickable));
  };
  visit(tree || {}, '', false);
  return { native: true, viewport: { width: px(root.w), height: px(root.h) }, interactive, texts, scrollHeight: px(root.h), scrollWidth: px(root.w) };
}

/** A Maestro flow that brings the app to a screen: launch, then tap each label in turn. */
export function flowFor(app, steps = [], { clearState = true } = {}) {
  const q = (s) => JSON.stringify(String(s));
  return [`appId: ${app}`, '---', `- launchApp:${clearState ? '\n    clearState: true' : ' {}'}`, '- waitForAnimationToEnd', ...steps.flatMap((s) => [`- tapOn: ${q(s)}`, '- waitForAnimationToEnd'])].join('\n') + '\n';
}

/** Commands that put the device into a variant and back (light, dark, large text). */
export function variantCommands(platform, variant) {
  if (platform === 'android') {
    return {
      light: [['adb', ['shell', 'cmd', 'uimode', 'night', 'no']], ['adb', ['shell', 'settings', 'put', 'system', 'font_scale', '1.0']]],
      dark: [['adb', ['shell', 'cmd', 'uimode', 'night', 'yes']], ['adb', ['shell', 'settings', 'put', 'system', 'font_scale', '1.0']]],
      'large-text': [['adb', ['shell', 'cmd', 'uimode', 'night', 'no']], ['adb', ['shell', 'settings', 'put', 'system', 'font_scale', '1.3']]],
    }[variant];
  }
  return {
    light: [['xcrun', ['simctl', 'ui', 'booted', 'appearance', 'light']], ['xcrun', ['simctl', 'ui', 'booted', 'content_size', 'large']]],
    dark: [['xcrun', ['simctl', 'ui', 'booted', 'appearance', 'dark']], ['xcrun', ['simctl', 'ui', 'booted', 'content_size', 'large']]],
    'large-text': [['xcrun', ['simctl', 'ui', 'booted', 'appearance', 'light']], ['xcrun', ['simctl', 'ui', 'booted', 'content_size', 'accessibility-large']]],
  }[variant];
}
