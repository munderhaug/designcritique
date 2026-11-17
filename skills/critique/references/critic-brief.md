# Critic brief (fill in and send to each critic)

Replace the angle-bracket parts. Keep the brief factual. Don't describe how the screens were
made or what you think of them: the critic must judge the screens cold.

## ux-critic and ui-critic

```
You are critiquing mobile app mockups for <ux | ui> issues.

Run folder: <RUN_DIR>
Problem frame (read first): <RUN_DIR>/framing.md
Design tokens: <RUN_DIR>/DESIGN.md or "none"
Principles library: <PLUGIN_ROOT>/skills/principles/references/
Output format: <PLUGIN_ROOT>/skills/critique/references/output-format.md
Severity rules: <PLUGIN_ROOT>/skills/critique/references/severity.md
Deterministic findings already reported (don't repeat; you may raise severity with a reason):
  <RUN_DIR>/checks/findings.json
Reference screens from shipped apps: <RUN_DIR>/references.md, or "none"
Companion guidance (ui critic; read alongside the principles): <SKILL.md paths, or "none">

Screens, in flow order:
| id | title | platform | flow / step | notes | screenshots (standard light first) |
|----|-------|----------|-------------|-------|------------------------------------|
| <id> | <title> | <ios> | <onboarding / 2> | <notes> | <RUN_DIR>/screenshots/<file>.png, … |

<ui critic only, if relevant:> Variant groups to compare: <group: id, id, …>

Return only the JSON object described in the output format.
```

Which screenshots to list: for every screen, the standard light render first (and its `__full`
version if there is one), then dark, then large text, then compact. For image inputs, the one
image. Leave out the rest so the critic's context stays small.

## Impeccable (general-purpose agent)

```
Use the Impeccable skill to review these mobile mockups. Run its critique and audit commands
on each HTML file, and its detector: npx impeccable detect --json <file>.
Product context for Impeccable (platform, audience): <path to PRODUCT.md>
HTML mockups: <list of source paths from RUN_DIR/manifest.json, with their screen ids>

Then convert every issue into the designcritique findings format
(<PLUGIN_ROOT>/skills/critique/references/output-format.md), with "critic": "impeccable".
Map each issue to the closest principle ID from <PLUGIN_ROOT>/skills/principles/references/
(keep Impeccable's own rule name in "evidence"), and set severity using
<PLUGIN_ROOT>/skills/critique/references/severity.md.
Don't edit any files. Return only the JSON object.
```
