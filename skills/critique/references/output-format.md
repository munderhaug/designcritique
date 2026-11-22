# Critic output format

Critics reply with **one JSON object and nothing else**. The orchestrator saves it with
`save-critique.mjs` to `RUN_DIR/critique/<name>.json`, and `render-report.mjs` validates and merges it.
The JSON Schema is in `PLUGIN_ROOT/schemas/critic-output.schema.json`.

```json
{
  "critic": "anthropic-design",
  "method": "design-critique + accessibility-review + ux-copy + cognitive walkthrough",
  "frame_check": {
    "fit": "strong | partial | weak | unknown",
    "score": 6,
    "summary": "One or two sentences: do these screens serve the problem and users in PRODUCT.md?",
    "assumptions_relied_on": ["[assumption] lines from PRODUCT.md that this judgement depends on"]
  },
  "tasks": [
    {
      "id": "T1",
      "task": "Pay for the order",
      "coverage": "whole",
      "user": "Primary user from PRODUCT.md",
      "verdict": "supported | at-risk | blocked | not-covered",
      "score": 4,
      "summary": "Why, in one or two sentences.",
      "steps": [
        { "screen": "checkout", "action": "Tap Pay now", "q1": true, "q2": true, "q3": true, "q4": false, "finding_ids": ["ad-4"] }
      ]
    }
  ],
  "findings": [
    {
      "id": "ad-4",
      "screen": "checkout",
      "rule": "NN-H1",
      "basis": ["NN-H1", "TASK-WALK-Q4"],
      "category": "ux",
      "severity": "P1",
      "title": "No sign that payment is processing or done",
      "evidence": "checkout__ios-standard__light.png: after the Pay now button there is no loading or confirmation state in the provided screens.",
      "impact": "The primary user, paying on the move, may tap twice or leave unsure whether they paid (task 1, must not fail).",
      "recommendation": "Add a processing state on the button and a confirmation screen showing the order number.",
      "confidence": "medium",
      "task": "Pay for the order",
      "element": { "region": "bottom action area", "selector": null }
    }
  ],
  "strengths": [
    { "screen": "checkout", "text": "Order summary sits at the top, so the total is checked before paying.", "basis": ["NN-H6"] }
  ],
  "comparisons": [
    { "group": "home-directions", "recommended": "home-b", "ranking": ["home-b", "home-a"], "reasons": "…tied to the users and tasks…" }
  ]
}
```

Field rules:
- `critic`: `anthropic-design` (design-reviewer agent), `impeccable` (converted Impeccable critique),
  `ia`, `scope` or `system` (the review lenses), `frame` (the frame challenger), or
  `external-<name>` for an extra judge running on another model or tool (critic-brief.md).
- `method`: optional; what the critic actually used, e.g. `fallback: principles index` when the Anthropic design plugin isn't installed.
- `frame_check` and `tasks`: the design-reviewer, Impeccable and external judges. Impeccable also
  puts its own heuristic scores in `frame_check.summary`. The lens reviewers return neither.
  `comparisons`: only when screens share a `group`.
- `tasks[].id`: the key task's ID from PRODUCT.md (its list number: `T1`, `T2`, …). Score every
  key task; the gate fails on a key task nobody scored. `tasks[].coverage`: `whole` when you had
  every screen of the task, `partial` when you had only some (a batch reviewer). Partial scores
  are reported but never count in the gate. The orchestrator stamps `coverage` from your brief
  when it saves your reply, so a batch stays `partial` whatever it writes.
- `tasks[].score`: a number 0–10. For a task whose screens you didn't have, set `verdict:
  "not-covered"` and leave `score` out (or `null`).
- `screen`: a screen id from the manifest, or `"*"` for the whole set.
- `rule`: the single most specific principle ID; `basis` lists all that apply, most specific first.
  Use only IDs from [the list below](#valid-principle-ids). Never make one up (`UXCOPY-TONE`,
  `FITTS`, `GESTALT-FIGURE-GROUND`): cite the nearest real one (`COPY-TONE`, `LAW-FITTS`,
  `GESTALT-FIGURE`). The validator rejects any other ID and names the nearest.
- `category`: one of `task-fit, ux, content, visual, layout, typography, color, a11y, platform, tokens`,
  and in a whole-product review also `journey, ia, scope, consistency, logic, spec, states`; `ethics` for
  deceptive patterns (`ETHICS-*`) in either mode.
- `level` (review): `screen`, `journey` or `system`. Journey and system findings set `screen: "*"`
  and list `affected_screens` (screen ids from the manifest); journey findings name the `journey`.
- `move_to` (review): where a misplaced thing should go, as `{ item, from, to, reason }`. It is a
  proposal for the person, never an edit.
- `severity`: `P0`–`P3`, per severity.md, for every critic: a tool's own scale goes in `evidence`.
- `evidence`: what is visible and where, naming the screenshot file and variant. No evidence, no finding.
- `impact`: which user, in which task, and how. Use the words of PRODUCT.md.
- `confidence`: `low` when a static mockup can't show it (motion, real data, behaviour).
- Up to 15 findings per critic per 8 screens, most severe first. Zero findings is a valid result for a good screen.

## Beyond findings

```json
"challenges": [
  { "id": "ad-c1", "kind": "alternative", "basis": ["FRAME-ALTERNATIVE"], "confidence": "medium",
    "claim": "Paying could happen on the cart itself; the separate checkout screen adds a step.",
    "why": "checkout__ios-standard__light.png repeats the cart's summary; only the pay button is new.",
    "question": "What does the separate screen give the person paying that the cart can't?",
    "if_wrong": null }
],
"not_examined": ["The error state after a declined card: no screen shows it."]
```

- `challenges`: questions and positions for the designer, about the frame, the concept or a
  choice. Not defects: no `severity`, never in the gate. `kind` is `first-read`, `assumption`,
  `premortem`, `alternative` or `blind-spot`; `basis` cites `FRAME-*` IDs. Use them for what you
  can argue but not prove from the screens, instead of dropping it or dressing it as a finding.
  At most five per critic (eight for the frame challenger, critic `frame`, which returns only these).
- `findings[].alternatives`: one or two other ways to solve the finding, when a real one exists.
  `recommendation` stays the one you would pick.
- `not_examined`: what you did not or could not look at. Silence must not read as approval.

## Scores (0–10)

Score each key task (`tasks[].score`, by its `id`) and the set as a whole (`frame_check.score`).
The report's gate uses the lowest score any critic that walked the whole task gave it, so score
what you can defend, not what you hope.

| Score | Means |
|---|---|
| 10 | Every walkthrough step passes all four questions; nothing to fix on this task |
| 9 | Passes; only P3 polish left |
| 7–8 | Passes, with P2 friction some users will feel (`at-risk` if it's on the main path) |
| 5–6 | A P1 on the path: many users will err or need help |
| 3–4 | A step fails for the described user, or a must-not-fail step has a P1 |
| 0–2 | The task can't be done with these screens, or a P0 blocks it |

**Assess before you score.** For each key task, first score `subscores.effectiveness` (can the
user complete it, with what errors?), `subscores.efficiency` (steps, time, thinking) and
`subscores.satisfaction` (confidence, trust, effort) 0–10, each on its own, from the success
criteria in PRODUCT.md. Only then give the task its overall `score`. Separate assessments made
before a holistic judgement reduce noise (Kahneman, Sibony & Sunstein, *Noise*, 2021: the
"mediating assessments protocol"). The task score usually sits near the lowest subscore.

A score must agree with the findings and verdict: a task with an open P1 on its path can't
score above 6; `blocked` means 0–4 and 0–4 means `blocked`; `supported` means 7–10. The validator
warns when they disagree. Model judges tend to grade generously; when
between two scores, pick the lower and say why in `summary`.

## Review mode (/designcritique:review)

In review mode the design-reviewer and Impeccable also get the journeys lens and return:

- `journeys`: one per journey they judged: `{ journey, verdict, score, summary, steps: [{ step,
  screen, action, verdict: ok | friction | blocked, note, finding_ids }] }`.

The lens reviewers (`ia`, `scope`, `system`) return, alongside `findings`:

- `moves`: proposed structural moves: `{ item, from, to, reason, impact, finding_id }`.
  `impact` is one word, `high`, `medium` or `low`; the why goes in `reason`.
- `scope`: feature against problem: `{ feature, verdict, job, task, phase, reason, finding_id }`,
  with `verdict` one of `keep`, `cut`, `add`, `move`, `defer`, `rethink`.
- Optional fields (`from`, `finding_id`, `job`, `task`, `phase`): leave them out when there is
  nothing to say. `finding_id` names one of your own findings' `id`.
- `journeys[].verdict`: `supported`, `at-risk`, `blocked` or `not-covered`; `steps[].verdict`:
  `ok`, `friction` or `blocked`.

Scores for journeys use the same anchors as key tasks.

## Size

Keep the reply under about 40 KB: evidence names the screenshot and what is visible in one or
two sentences, and the finding cap above holds. Longer replies can be cut off on the way back.

## Valid principle IDs

From `skills/principles/references/` (the unit tests keep this list in step with it). Each
file there says what an ID means and its source.

<!-- ids:start -->
- `AND-APPBAR` `AND-BUTTONS` `AND-COLOR` `AND-FEEDBACK` `AND-ICONS` `AND-LAYOUT` `AND-MOTION` `AND-NAV-BAR` `AND-NOT-IOS` `AND-SHAPE` `AND-TARGET` `AND-TYPE`
- `COGA-FIND` `COGA-FOCUS` `COGA-HELP` `COGA-MEMORY` `COGA-MISTAKES` `COGA-PURPOSE`
- `CONS-COMPONENT` `CONS-FIGURES` `CONS-FORMAT` `CONS-ICON` `CONS-PATTERN` `CONS-TERM`
- `COPY-ACTION-LABEL` `COPY-CLEAR` `COPY-CONCISE` `COPY-ERROR` `COPY-PURPOSEFUL` `COPY-TONE`
- `DS-AGENT-RULES` `DS-CONTRAST` `DS-ESSENTIALS` `DS-ROLES` `DS-SCALE`
- `ETHICS-ASYMMETRY` `ETHICS-CONFIRMSHAMING` `ETHICS-FORCED` `ETHICS-NAGGING` `ETHICS-OBSTRUCTION` `ETHICS-PRESELECTED` `ETHICS-PRESSURE` `ETHICS-SNEAKING`
- `FRAME-ALTERNATIVE` `FRAME-ASSUMPTION` `FRAME-EXCLUDED` `FRAME-FIRST-READ` `FRAME-PREMORTEM` `FRAME-PROBLEM`
- `GESTALT-CONTINUITY` `GESTALT-FIGURE` `GESTALT-PROXIMITY` `GESTALT-REGION` `GESTALT-SIMILARITY`
- `IA-DEPTH` `IA-DUPLICATE` `IA-LABEL` `IA-NAV-CONSISTENT` `IA-OBJECTS` `IA-ORPHAN` `IA-PLACEMENT`
- `INTL-EXPANSION` `INTL-RTL`
- `IOS-COLOR` `IOS-CONTROLS` `IOS-DESTRUCTIVE` `IOS-ICONS` `IOS-LAYOUT` `IOS-LISTS` `IOS-MATERIALS` `IOS-MODAL` `IOS-MOTION` `IOS-NAV-STACK` `IOS-NAV-TABBAR` `IOS-TARGET` `IOS-TYPE`
- `JOURNEY-BROKEN` `JOURNEY-CLOSE` `JOURNEY-CONTEST` `JOURNEY-DEAD-END` `JOURNEY-ENTRY` `JOURNEY-HANDOFF` `JOURNEY-HELP` `JOURNEY-PEAK-END` `JOURNEY-WAY-BACK`
- `LAW-FITTS` `LAW-HICK` `LAW-JAKOB` `LAW-LOAD` `LAW-REACH` `LAW-RESPONSE` `LAW-TESLER`
- `NN-H1` `NN-H10` `NN-H2` `NN-H3` `NN-H4` `NN-H5` `NN-H6` `NN-H7` `NN-H8` `NN-H9`
- `NORMAN-CONSTRAINT` `NORMAN-FEEDBACK` `NORMAN-GULFS` `NORMAN-MAPPING` `NORMAN-MODEL` `NORMAN-SIGNIFIER`
- `PRIV-DEFAULT` `PRIV-EXPLAIN` `PRIV-IN-CONTEXT` `PRIV-MINIMUM` `PRIV-WORKS-WITHOUT`
- `SCOPE-ALTERNATIVE` `SCOPE-GAP` `SCOPE-NO-JOB` `SCOPE-OUT` `SCOPE-PHASE`
- `SPEC-DRIFT` `SPEC-JOURNEY` `SPEC-NAV-ORDER`
- `STATE-EMPTY` `STATE-ERROR` `STATE-FIRST-RUN` `STATE-LOADING` `STATE-OFFLINE` `STATE-PARTIAL`
- `TASK-FIT` `TASK-WALK-Q1` `TASK-WALK-Q2` `TASK-WALK-Q3` `TASK-WALK-Q4`
- `TELL-BUZZWORDS` `TELL-CARDS` `TELL-CTA-STACK` `TELL-EMOJI` `TELL-EYEBROW` `TELL-FAKE-PROOF` `TELL-GRADIENT` `TELL-SAMENESS` `TELL-WEB-IDIOMS`
- `VIS-COLOR` `VIS-HIERARCHY` `VIS-ISOLATION` `VIS-MOTION` `VIS-SPACING` `VIS-TYPE`
- `WCAG-1.1.1` `WCAG-1.3.1` `WCAG-1.3.2` `WCAG-1.3.4` `WCAG-1.3.5` `WCAG-1.4.1` `WCAG-1.4.10` `WCAG-1.4.11` `WCAG-1.4.3` `WCAG-1.4.4` `WCAG-2.2.2` `WCAG-2.3.3` `WCAG-2.4.11` `WCAG-2.4.3` `WCAG-2.4.4` `WCAG-2.4.6` `WCAG-2.4.7` `WCAG-2.5.1` `WCAG-2.5.7` `WCAG-2.5.8` `WCAG-3.3.1` `WCAG-3.3.2` `WCAG-3.3.3` `WCAG-3.3.7` `WCAG-3.3.8` `WCAG-4.1.2`
<!-- ids:end -->
