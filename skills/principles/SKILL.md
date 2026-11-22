---
name: principles
description: Citation index of established design principles with stable IDs - Nielsen's heuristics, Norman, the cognitive walkthrough, Gestalt, Fitts and Hick, WCAG 2.2, Apple HIG, Material 3, common AI-generated UI tells, information architecture, journeys, scope, states, consistency, interface copy and spec conformance - each summarised from its primary source. Use to cite the principle behind a design finding or decision on a mobile screen.
---

# Design principles: citation index

This is a citation index, not a critique method. The methods come from Impeccable's critique
and Anthropic's design plugin (see the critique skill). Every finding, whichever tool produced
it, cites a principle ID from these files. That lets findings be merged and de-duplicated, lets
readers look up the primary source, and lets the eval set score the critics. Each file
summarises its primary sources and names them. Read only the files the task needs.

| File | Covers | IDs |
|---|---|---|
| [heuristics.md](references/heuristics.md) | Nielsen's 10 usability heuristics; Norman's principles of interaction | `NN-H1`–`NN-H10`, `NORMAN-*` |
| [cognitive-walkthrough.md](references/cognitive-walkthrough.md) | Task-based evaluation method (Wharton et al.) | `TASK-FIT`, `TASK-WALK-Q1`–`Q4` |
| [perception.md](references/perception.md) | Gestalt grouping, visual hierarchy, type, colour, isolation effect | `GESTALT-*`, `VIS-*` |
| [interaction-laws.md](references/interaction-laws.md) | Fitts, Hick–Hyman, Jakob, cognitive load, reach, response time | `LAW-*` |
| [accessibility.md](references/accessibility.md) | WCAG 2.2 success criteria that apply to phone screens; cognitive accessibility (W3C, 2021) | `WCAG-x.y.z`, `COGA-*` |
| [ios.md](references/ios.md) | Apple Human Interface Guidelines on iPhone | `IOS-*` |
| [android.md](references/android.md) | Material 3 and Android conventions | `AND-*` |
| [design-systems.md](references/design-systems.md) | Colour roles, token contrast, scales, the eight essentials, agent rules | `DS-*` |
| [ai-tells.md](references/ai-tells.md) | Patterns that make generated UI look generic | `TELL-*` |
| [ia.md](references/ia.md) | Information architecture: placement, depth, objects (OOUX), duplicates, orphans, labels | `IA-*` |
| [journeys.md](references/journeys.md) | Whole journeys: entry, hand-offs, dead ends, ways back, closing loops, peak–end | `JOURNEY-*` |
| [scope.md](references/scope.md) | Feature against problem: jobs, gaps, alternatives, phase | `SCOPE-*` |
| [states.md](references/states.md) | The UI stack: empty, error, loading, partial, offline, first run; numbers that agree | `STATE-*` |
| [copy.md](references/copy.md) | Interface copy: clear, concise, purposeful, tone, action labels, error messages (Podmajersky, Yifrah, Nielsen, Redish) | `COPY-*` |
| [consistency.md](references/consistency.md) | One component, icon, term and format per meaning | `CONS-*` |
| [spec.md](references/spec.md) | The prototype against the owner's own spec | `SPEC-*` |
| [framing.md](references/framing.md) | Challenging the frame and concept: first read, problem statement, assumptions, pre-mortem, alternatives, who is left out. For challenges, never findings | `FRAME-*` |
| [privacy.md](references/privacy.md) | Permissions asked in context and explained, the app working without them, data minimum, private by default | `PRIV-*` |
| [international.md](references/international.md) | Longer text in other languages, right-to-left layouts | `INTL-*` |
| [ethics.md](references/ethics.md) | Deceptive patterns: pre-ticked consent, asymmetric choices, confirmshaming, obstruction, sneaking, false pressure, forced action, nagging | `ETHICS-*` |

## How to use the principles

- **Problem first.** A principle matters only through its effect on the people and tasks
  in `PRODUCT.md`. Write "Ana, paying one-handed on a train, can't find the total" rather than "violates H6".
- **Prefer the most specific ID.** Cite `WCAG-1.4.3` rather than `NN-H4` when contrast is the issue.
  You can list several IDs in `basis`, specific first.
- **Conventions are evidence too.** Following the platform is a usability principle (`LAW-JAKOB`,
  `NN-H4`), not a style preference. Deviate only when the deviation clearly serves the user.
- **Taste is not a finding.** Without a principle and an affected user, it's a suggestion at best.
  Leave it out or put it under "ideas".
