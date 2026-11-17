# Critic briefs

Fill in the angle-bracket parts. Keep briefs factual. Don't describe how the screens were made
or what you think of them: critics judge the screens cold.

## design-reviewer (Anthropic design-plugin methods)

```
Review these mobile app mockups.

Run folder: <RUN_DIR>
Problem frame (read first): <RUN_DIR>/framing.md
Design tokens: <RUN_DIR>/DESIGN.md or "none"
Methods (read these SKILL.md files first; from Anthropic's design plugin):
  design-critique: <path, or "not installed">
  accessibility-review: <path, or "not installed">
  ux-copy: <path, or "not installed">
Principles index (IDs for rule/basis; cognitive-walkthrough.md for the task walkthrough):
  <PLUGIN_ROOT>/skills/principles/references/
Companion guidance for the platform, if installed: <SKILL.md paths, or "none">
Output format: <PLUGIN_ROOT>/skills/critique/references/output-format.md
Severity rules: <PLUGIN_ROOT>/skills/critique/references/severity.md
Deterministic findings already reported (don't repeat): <RUN_DIR>/checks/findings.json
Reference screens from shipped apps: <RUN_DIR>/references.md, or "none"

Screens, in flow order:
| id | title | platform | flow / step | notes | screenshots (standard light first) |
|----|-------|----------|-------------|-------|------------------------------------|
| <id> | <title> | <ios> | <onboarding / 2> | <notes> | <RUN_DIR>/screenshots/<file>.png, … |

Variant groups to compare, if any: <group: id, id, …>

Return only the JSON object described in the output format, with "critic": "anthropic-design".
```

List, for every screen, the standard light render first (and `__full` if present), then dark,
large text and compact. For image inputs, the one image.

## Impeccable (fresh general-purpose agent)

```
Run Impeccable's critique on these mobile mockups. Follow the Impeccable skill's critique
reference exactly, including its rules for native platforms (ios / android / adaptive), where
the web detector does not apply. Don't edit any files. Skip the closing questions and write
"Questions skipped: run inside designcritique".

Product context (Impeccable reads it): <path to PRODUCT.md>
Screens: <for each: screen id, HTML source path from RUN_DIR/manifest.json, and its
standard-light screenshot path in RUN_DIR/screenshots>

Afterwards, convert every Priority Issue, persona red flag and minor observation into the
designcritique findings format (<PLUGIN_ROOT>/skills/critique/references/output-format.md),
with "critic": "impeccable". Keep Impeccable's P0-P3 severity. Map each issue to the closest
principle ID in <PLUGIN_ROOT>/skills/principles/references/ (Nielsen heuristics are NN-H1 to
NN-H10) and quote Impeccable's own label in "evidence". Put its heuristic scores and Design
Health Score in "frame_check.summary". Return only the JSON object.
```
