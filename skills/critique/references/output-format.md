# Critic output format

Critics reply with **one JSON object and nothing else**. The orchestrator saves it to
`RUN_DIR/critique/<critic>.json`, and `render-report.mjs` validates and merges it.
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
      "task": "Pay for the order",
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
  ],
  "taste_check": {
    "score": 7,
    "summary": "Type and spacing follow the chosen references; the colour is flatter and the hero has none of their texture.",
    "gaps": [{ "screen": "home", "reference": "taste/03-field-notes.png", "text": "Reference uses a warm paper ground and a hand-drawn map; the mockup uses a plain white card." }]
  }
}
```

Field rules:
- `critic`: `anthropic-design` (design-reviewer agent), `impeccable` (converted Impeccable critique),
  or `external-<name>` for an extra judge running on another model or tool (critic-brief.md).
- `method`: optional; what the critic actually used, e.g. `fallback: principles index` when the Anthropic design plugin isn't installed.
- `frame_check` and `tasks`: design-reviewer; Impeccable puts its scores in `frame_check.summary`. `comparisons`: only when screens share a `group`.
- `screen`: a screen id from the manifest, or `"*"` for the whole set.
- `rule`: the single most specific principle ID; `basis` lists all that apply, most specific first. IDs come from the principles library.
- `category`: one of `task-fit, ux, content, visual, layout, typography, color, a11y, platform, tokens`,
  and in a whole-product review also `journey, ia, scope, consistency, logic, spec, states`; `ethics` for
  deceptive patterns (`ETHICS-*`) in either mode.
- `level` (review): `screen`, `journey` or `system`. Journey and system findings set `screen: "*"`
  and list `affected_screens` (screen ids from the manifest); journey findings name the `journey`.
- `move_to` (review): where a misplaced thing should go, as `{ item, from, to, reason }`. It is a
  proposal for the person, never an edit.
- `severity`: `P0`–`P3`, per severity.md.
- `evidence`: what is visible and where, naming the screenshot file and variant. No evidence, no finding.
- `impact`: which user, in which task, and how. Use the words of PRODUCT.md.
- `confidence`: `low` when a static mockup can't show it (motion, real data, behaviour).
- `taste_check`: only when the brief lists taste references. Separate from findings: closeness
  to a reference never excuses a usability problem, and distance from one is not a finding.
- Up to 15 findings per critic per 8 screens, most severe first. Zero findings is a valid result for a good screen.

## Scores (0–10)

Score each key task (`tasks[].score`) and the set as a whole (`frame_check.score`). The report's
gate uses the lowest score any critic gave a task, so score what you can defend, not what you hope.

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

Lens reviewers add, alongside `findings`:

- `journeys`: one per journey they judged: `{ journey, verdict, score, summary, steps: [{ step,
  screen, action, verdict: ok | friction | blocked, note, finding_ids }] }`.
- `moves`: proposed structural moves: `{ item, from, to, reason, impact, finding_id }`.
- `scope`: feature against problem: `{ feature, verdict: keep | cut | add | move | defer |
  rethink, job, task, phase, reason, finding_id }`.

Scores for journeys use the same anchors as key tasks.
