// Deceptive patterns a screen can show without running it (principles: ETHICS-*).
// Sources: Gray et al., "The Dark (Patterns) Side of UX Design", CHI 2018 (interface interference,
// sneaking, forced action); Mathur et al., "Dark Patterns at Scale", CSCW 2019 (misdirection,
// confirmshaming, visual interference); Brignull, Deceptive Patterns (2023); CJEU, Planet49
// (C-673/17, 2019): a pre-ticked box is not valid consent; EDPB Guidelines 03/2022 on deceptive
// design patterns. Words come from catalog/vocabulary.yaml, so the checks work per language.
import { parseColor, colorDistance } from './tokens.mjs';

const filled = (c, pageBg) => {
  const bg = parseColor(c.style?.bg || '');
  const page = parseColor(pageBg || '#ffffff');
  return !!(bg && page && colorDistance(bg, page) > 40);
};
/** Visual weight of a control: its area, whether it's filled, its type size and weight. */
export function prominence(c, pageBg) {
  const area = Math.max(1, c.box.w * c.box.h);
  return area * (filled(c, pageBg) ? 1.6 : 1) * ((c.style?.size || 16) / 16) * (Number(c.style?.weight) >= 600 ? 1.2 : 1);
}

/** interactive: analyze-page controls; text: the screen's text; vocab: loadVocabulary(). */
export function ethicsFindings({ interactive, text, pageBg, vocab }) {
  const out = [];
  const live = interactive.filter((c) => !c.disabled && c.name);
  const toggles = live.filter((c) => c.type === 'checkbox' || ['checkbox', 'switch'].includes(c.role));

  // Pre-ticked consent: marketing, sharing or tracking already on.
  const preselected = toggles.filter((c) => c.checked && vocab.consent.test(c.name));
  if (preselected.length) out.push({
    rule: 'CHK-PRESELECTED-CONSENT', basis: ['ETHICS-PRESELECTED', 'NN-H3'], severity: 'P1',
    title: `${preselected.length} consent option(s) already switched on`,
    element: { selector: preselected[0].selector, name: preselected[0].name, box: preselected[0].box },
    evidence: preselected.map((c) => `"${c.name}" is on before the user chose`).join('\n'),
    recommendation: 'Leave marketing, data-sharing and tracking options off until the user turns them on; a pre-ticked box is not consent (CJEU, Planet49, 2019).',
  });

  // An accept/decline choice where declining is much weaker, on a consent or permission screen.
  const consentScreen = vocab.consent.test(text);
  const accepts = live.filter((c) => vocab.accept.test(c.name) && !vocab.decline.test(c.name));
  const declines = live.filter((c) => vocab.decline.test(c.name));
  if (consentScreen) {
    for (const a of accepts) {
      const d = declines.filter((x) => Math.abs((x.box.y + x.box.h / 2) - (a.box.y + a.box.h / 2)) < 220)
        .sort((x, y) => prominence(y, pageBg) - prominence(x, pageBg))[0];
      if (!d) continue;
      const ratio = prominence(a, pageBg) / prominence(d, pageBg);
      if (ratio >= 3) {
        out.push({
          rule: 'CHK-ASYMMETRIC-CHOICE', basis: ['ETHICS-ASYMMETRY', 'VIS-HIERARCHY'], severity: 'P2', confidence: 'medium',
          title: `"${a.name}" is ${Math.round(ratio)}× more prominent than "${d.name}"`,
          element: { selector: d.selector, name: d.name, box: d.box },
          evidence: `On a screen about consent or data, "${a.name}" (${a.box.w}×${a.box.h}${filled(a, pageBg) ? ', filled' : ''}, ${a.style?.size}px) is set against "${d.name}" (${d.box.w}×${d.box.h}${filled(d, pageBg) ? ', filled' : ''}, ${d.style?.size}px).`,
          recommendation: 'Give accepting and declining the same visual weight (same component, size and placement), so the choice is the user\'s, not the layout\'s (EDPB Guidelines 03/2022).',
        });
        break;
      }
    }
  }

  // Confirmshaming: the decline option is worded to make the user feel bad.
  const shamed = live.filter((c) => vocab.shaming.test(c.name.trim()));
  if (shamed.length) out.push({
    rule: 'CHK-CONFIRMSHAMING', basis: ['ETHICS-CONFIRMSHAMING', 'NN-H2'], severity: 'P2',
    title: `Declining is worded to shame: "${shamed[0].name}"`,
    element: { selector: shamed[0].selector, name: shamed[0].name, box: shamed[0].box },
    evidence: shamed.map((c) => `"${c.name}"`).join(', '),
    recommendation: 'Word the decline option neutrally ("No thanks", "Not now"); let the offer stand on its own.',
  });
  return out;
}
