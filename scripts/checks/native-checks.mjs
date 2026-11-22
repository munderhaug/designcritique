import { MIN_TARGET } from '../lib/config.mjs';

const PLATFORM_UNIT = { ios: 'pt', android: 'dp' };

// A native screen (scripts/capture/native.mjs): what its accessibility hierarchy can show.
// Target sizes in pt or dp, and controls a screen reader can't name. Type, contrast and layout
// need the rendering engine's own tools and are left to the critics.
export function nativeChecks(screen, { add, load, notes, primaryCapture, tagOf }) {
  for (const platform of [...new Set(screen.captures.map((c) => c.platform))]) {
    const main = primaryCapture(screen, platform);
    if (!main?.data) { notes.push({ screen: screen.id, note: 'Native screen without a readable hierarchy: critics only.' }); continue; }
    const d = load(main.data);
    const base = { screen: screen.id, mockup: screen.mockupId, platform, surface: 'native-render' };
    const min = MIN_TARGET[platform]; const unit = PLATFORM_UNIT[platform];
    const small = d.interactive.filter((el) => !el.disabled && (el.box.w < min - 0.5 || el.box.h < min - 0.5));
    for (const el of small.slice(0, 8)) {
      add({
        ...base, rule: 'CHK-TARGET', category: 'a11y', severity: Math.min(el.box.w, el.box.h) < min * 0.75 ? 'P1' : 'P2',
        title: `Tap target ${el.box.w}×${el.box.h} is below ${min}×${min} ${unit}`,
        element: { selector: el.selector, name: el.name, box: el.box },
        evidence: `${el.tag}${el.name ? ` "${el.name}"` : ' (no name)'} is ${el.box.w}×${el.box.h} ${unit} in the app's accessibility hierarchy on ${main.deviceName}.`,
        recommendation: `Make the tappable area at least ${min}×${min} ${unit}. The visible shape can stay smaller if the hit area is padded.`,
        seenIn: [tagOf(main)],
      });
    }
    const unnamed = d.interactive.filter((el) => !el.disabled && !el.name);
    if (unnamed.length) add({
      ...base, rule: 'CHK-NATIVE-NAME', category: 'a11y', severity: 'P1',
      title: `${unnamed.length} control(s) have no name for a screen reader`,
      element: { selector: unnamed[0].selector, box: unnamed[0].box },
      evidence: unnamed.slice(0, 5).map((el) => `${el.tag} at ${el.box.x},${el.box.y} (${el.box.w}×${el.box.h}): no label, text or description in the accessibility hierarchy`).join('\n'),
      recommendation: platform === 'ios' ? 'Give each control an accessibilityLabel that says what it does.' : 'Give each control a contentDescription (or visible text) that says what it does.',
      seenIn: [tagOf(main)], key: 'unnamed',
    });
  }
}

