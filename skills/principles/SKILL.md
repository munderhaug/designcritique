---
name: principles
description: Established design theory and research for judging mobile app screens - Nielsen's heuristics, Norman's principles, the cognitive walkthrough, Gestalt and visual hierarchy, Fitts's and Hick's laws, cognitive load, WCAG 2.2, Apple HIG and Material 3, plus common AI-generated UI tells. Use when critiquing or designing a mobile screen or flow and a finding or decision should rest on a named principle.
---

# Design principles library

Every critique finding cites at least one principle ID from these files, so a reader can
check the reasoning and look up the source. Read only the files the task needs.

| File | Covers | IDs |
|---|---|---|
| [heuristics.md](references/heuristics.md) | Nielsen's 10 usability heuristics; Norman's principles of interaction | `NN-H1`–`NN-H10`, `NORMAN-*` |
| [cognitive-walkthrough.md](references/cognitive-walkthrough.md) | Task-based evaluation method (Wharton et al.) | `TASK-FIT`, `TASK-WALK-Q1`–`Q4` |
| [perception.md](references/perception.md) | Gestalt grouping, visual hierarchy, type, colour, isolation effect | `GESTALT-*`, `VIS-*` |
| [interaction-laws.md](references/interaction-laws.md) | Fitts, Hick–Hyman, Jakob, cognitive load, reach, response time | `LAW-*` |
| [accessibility.md](references/accessibility.md) | WCAG 2.2 success criteria that apply to phone screens | `WCAG-x.y.z` |
| [ios.md](references/ios.md) | Apple Human Interface Guidelines on iPhone | `IOS-*` |
| [android.md](references/android.md) | Material 3 and Android conventions | `AND-*` |
| [ai-tells.md](references/ai-tells.md) | Patterns that make generated UI look generic | `TELL-*` |

## How to use the principles

- **Problem first.** A principle matters only through its effect on the people and tasks
  in `PRODUCT.md`. Write "Ana, paying one-handed on a train, can't find the total" rather than "violates H6".
- **Prefer the most specific ID.** Cite `WCAG-1.4.3` rather than `NN-H4` when contrast is the issue.
  You can list several IDs in `basis`, specific first.
- **Conventions are evidence too.** Following the platform is a usability principle (`LAW-JAKOB`,
  `NN-H4`), not a style preference. Deviate only when the deviation clearly serves the user.
- **Taste is not a finding.** Without a principle and an affected user, it's a suggestion at best.
  Leave it out or put it under "ideas".
