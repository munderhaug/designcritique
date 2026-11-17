# Critic output format

Critics reply with **one JSON object and nothing else**. The orchestrator saves it to
`RUN_DIR/critique/<critic>.json`, and `render-report.mjs` validates and merges it.
The JSON Schema is in `PLUGIN_ROOT/schemas/critic-output.schema.json`.

```json
{
  "critic": "ux",
  "frame_check": {
    "fit": "strong | partial | weak | unknown",
    "summary": "One or two sentences: do these screens serve the problem and users in PRODUCT.md?",
    "assumptions_relied_on": ["[assumption] lines from PRODUCT.md that this judgement depends on"]
  },
  "tasks": [
    {
      "task": "Pay for the order",
      "user": "Primary user from PRODUCT.md",
      "verdict": "supported | at-risk | blocked | not-covered",
      "summary": "Why, in one or two sentences.",
      "steps": [
        { "screen": "checkout", "action": "Tap Pay now", "q1": true, "q2": true, "q3": true, "q4": false, "finding_ids": ["ux-4"] }
      ]
    }
  ],
  "findings": [
    {
      "id": "ux-4",
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
- `critic`: `ux`, `ui`, or `impeccable` for converted Impeccable output.
- `frame_check` and `tasks`: ux critic only. `comparisons`: ui critic only, and only when screens share a `group`.
- `screen`: a screen id from the manifest, or `"*"` for the whole set.
- `rule`: the single most specific principle ID; `basis` lists all that apply, most specific first. IDs come from the principles library.
- `category`: one of `task-fit, ux, content, visual, layout, typography, color, a11y, platform, tokens`.
- `severity`: `P0`–`P3`, per severity.md.
- `evidence`: what is visible and where, naming the screenshot file and variant. No evidence, no finding.
- `impact`: which user, in which task, and how. Use the words of PRODUCT.md.
- `confidence`: `low` when a static mockup can't show it (motion, real data, behaviour).
- Up to 12 findings per critic per 8 screens, most severe first. Zero findings is a valid result for a good screen.
