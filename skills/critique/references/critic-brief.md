# Critic briefs

Fill in the angle-bracket parts. Keep briefs factual. Don't describe how the screens were made
or what you think of them: critics judge the screens cold. Each critic uses only the methods its
brief names. Other design skills in the session (some, like Refero's `refero-design`, describe
themselves as the default for all design work) are not critique methods and stay out.

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
Deterministic findings already reported by the checks and detectors (don't repeat them;
  build on them only to say why one matters for a key task): <RUN_DIR>/checks/all.json
Reference screens from shipped apps: <RUN_DIR>/references.md, or "none"
Key tasks to score, by ID: <T1 name, T2 name, … from framing.md>. Coverage: <"whole" when this
  reviewer has every screen of every task; "partial" for a batch that has only some>
Direction the person chose (context only; don't score closeness, never excuse a finding by it):
  <RUN_DIR>/taste/*, or "none"
Decisions the person made on earlier findings: <project>/.designcritique/decisions.yaml, or "none"
Gate: fail on <fail_on>, target score <target_score> (score honestly; the gate uses the lowest)

Screens, in flow order:
| id | title | platform | flow / step | notes | screenshots (standard light first) |
|----|-------|----------|-------------|-------|------------------------------------|
| <id> | <title> | <ios> | <onboarding / 2> | <notes> | <RUN_DIR>/screenshots/<file>.png, … |

Variant groups to compare, if any: <group: id, id, …>

Return only the JSON object described in the output format, with "critic": "anthropic-design".
```

Spawn every critic (this one, Impeccable, the lens reviewers) with the model in
`critics.judge_model` (mockups.yaml) when it's set, through the Agent tool's model setting.
Otherwise pick a model other than the one that made the mockups, when you know which that was:
the model that wrote the screens is the worst judge of them.

With more than 8 screens, run one design-reviewer per batch of 8 with `Coverage: partial`, and
one more with every screen of the key tasks' flows and `Coverage: whole`: only whole-task scores
count in the gate.

List, for every screen, the standard light render first (and `__full` if present), then dark,
large text and compact. For image inputs, the one image.

## Impeccable (fresh general-purpose agent)

```
Run Impeccable's critique on these mobile mockups. Follow the Impeccable skill's critique
reference, including its rules for native platforms (ios / android / adaptive), plus any lens
added below (review mode adds the journeys lens). Don't run its detector: designcritique already
ran it as a check. Don't load other design skills. Don't edit any files. Skip the closing questions and write
"Questions skipped: run inside designcritique".

Product context (Impeccable reads it): <path to PRODUCT.md>
Screens: <for each: screen id, HTML source path from RUN_DIR/manifest.json, and its
standard-light screenshot path in RUN_DIR/screenshots>
Already reported by the checks and detectors (don't repeat): <RUN_DIR>/checks/all.json
Key tasks to score, by ID: <T1 name, T2 name, …>

Afterwards, convert every Priority Issue, persona red flag and minor observation into the
designcritique findings format (<PLUGIN_ROOT>/skills/critique/references/output-format.md),
with "critic": "impeccable". Set each finding's severity by <PLUGIN_ROOT>/skills/critique/references/severity.md
(the same scale the other critic uses) and quote Impeccable's own priority in "evidence". Add a
0-10 score for each key task by its ID ("id": "T1", "coverage": "whole"), using the anchors in
output-format.md, and an overall frame_check.score.
Don't raise findings dismissed in <decisions file, or "none"> without new evidence. Map each issue to the closest
principle ID in <PLUGIN_ROOT>/skills/principles/references/ (Nielsen heuristics are NN-H1 to
NN-H10) and quote Impeccable's own label in "evidence". Put its heuristic scores and Design
Health Score in "frame_check.summary". Return only the JSON object.
```

## External judge (optional, another model or tool)

The model that wrote the screens can't grade them objectively, and two critics on the same model
share blind spots. For each name in `critics.external` (mockups.yaml), give that tool the
design-reviewer brief above, unchanged except for `"critic": "external-<name>"`, and no other
context. For example, for `codex` (OpenAI's CLI), with the brief saved to a file:

```bash
codex exec --sandbox read-only "$(cat <RUN_DIR>/critique/brief-external.txt)" > <RUN_DIR>/critique/external-codex.json
```

The tool must be able to read the method and principle files the brief names. Save only its JSON
reply as `RUN_DIR/critique/external-<name>.json`. The hook validates it like the others, the
report merges it, and its task scores count in the gate. If the tool isn't installed or can't be
reached, say so in the reply and carry on.
