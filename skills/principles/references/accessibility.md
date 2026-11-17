# Accessibility: WCAG 2.2 on phone screens

Source: W3C, Web Content Accessibility Guidelines (WCAG) 2.2 (Recommendation, October 2023), and
W3C's guidance on applying WCAG to mobile. Its four principles: perceivable, operable,
understandable, robust (POUR). Native apps are commonly measured against WCAG 2.x AA as well.

The deterministic checks already cover contrast, names, target size, text scaling and reflow
on HTML mockups. A critic adds what needs judgment, and covers image-only mockups, where no checks run.

| ID | Success criterion (level) | What to look for |
|---|---|---|
| `WCAG-1.1.1` | Non-text content (A) | Icons and images that carry meaning need a text alternative |
| `WCAG-1.3.1` | Info and relationships (A) | Structure (headings, groups, labels) is real, not just visual |
| `WCAG-1.3.4` | Orientation (AA) | Don't lock to portrait unless essential |
| `WCAG-1.4.1` | Use of colour (A) | Status, errors, selection not shown by colour alone |
| `WCAG-1.4.3` | Contrast, minimum (AA) | 4.5:1 for text, 3:1 for large text |
| `WCAG-1.4.4` | Resize text (AA) | Text can grow to 200% without loss. On phones, think Dynamic Type / font scale |
| `WCAG-1.4.10` | Reflow (AA) | No horizontal scrolling at 320 CSS px width |
| `WCAG-1.4.11` | Non-text contrast (AA) | 3:1 for control boundaries, focus indicators, meaningful icons |
| `WCAG-2.4.4` | Link purpose, in context (A) | Link text says where it goes ("Terms of Service", not "here") |
| `WCAG-2.4.6` | Headings and labels (AA) | Headings and labels describe topic or purpose |
| `WCAG-2.5.1` | Pointer gestures (A) | Multi-point or path gestures have a single-tap alternative |
| `WCAG-2.5.7` | Dragging movements (AA, new in 2.2) | Anything done by dragging can also be done without dragging |
| `WCAG-2.5.8` | Target size, minimum (AA, new in 2.2) | 24×24 CSS px minimum. Platform guidance is stricter: 44×44 pt iOS, 48×48 dp Android |
| `WCAG-3.3.1` | Error identification (A) | Errors are identified and described in text |
| `WCAG-3.3.2` | Labels or instructions (A) | Fields have visible labels; placeholders that disappear aren't enough |
| `WCAG-3.3.3` | Error suggestion (AA) | Errors say how to fix them |
| `WCAG-3.3.7` | Redundant entry (A, new in 2.2) | Don't make people re-enter what they already gave in the same flow |
| `WCAG-3.3.8` | Accessible authentication, minimum (AA, new in 2.2) | No cognitive tests to log in; allow paste and password managers |
| `WCAG-4.1.2` | Name, role, value (A) | Custom controls expose what they are and their state |

Think about the whole range of users (Microsoft Inclusive Design toolkit's "persona spectrum"):
permanent (one arm), temporary (arm in a cast) and situational (holding a child) limits all hit
the same design problems.
