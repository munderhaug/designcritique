# What every lens reviewer gets and returns

You review the whole product, not single screens. You didn't build it. You can't edit anything.

**Read first, in this order:**
1. `framing.md`: problem, users, ranked key tasks, and the product sections: Journeys, Concept
   model, Scope, Feature map, Navigation.
2. `coverage.json`: which features, journeys and states were captured. Something not captured
   is **not covered**, not missing: say "not seen in the capture" and never claim the product
   lacks it.
3. `graph.json` and `inventory.json` (when present): every screen the crawler reached, its depth
   from the start, and which control leads where.
4. `checks/all.json`: every deterministic finding (screens, detectors, structure, consistency).
   Don't repeat them; build on them (explain why they matter for the users, or say why one is
   acceptable). The full entries are in `checks/structure.json` and `checks/consistency.json`.
5. Screenshots: one standard light capture per screen family (listed in your brief), and each
   journey's screens in order.

**Return one JSON object** in the designcritique format (`output-format.md`), with your
`critic` name. Every finding has `level` (`screen`, `journey` or `system`), `screen` (`"*"` for
journey and system findings), `affected_screens` (screen ids from the brief), a principle `rule`
and `basis` from the principles index, `evidence` naming what you saw and where, and a concrete
`recommendation`. Structural changes go in `move_to` and `moves`: they are proposals for the
person, never edits. Calibrate as `severity.md` says; a finding without an affected user and
task is taste, leave it out.

**Allowed values** (the validator rejects anything else):
- `rule` and `basis`: only IDs in output-format.md's list of valid principle IDs. Never make one up.
- `severity`: `P0`, `P1`, `P2` or `P3`. `level`: `screen`, `journey` or `system`. `confidence`:
  `high`, `medium` or `low`.
- `moves[].impact`: one word, `high`, `medium` or `low`; the why goes in `reason`.
- `scope[].verdict`: `keep`, `cut`, `add`, `move`, `defer` or `rethink`.
- Optional fields you have nothing for (`from`, `finding_id`, `job`, `task`, `phase`): leave them out.
- Keep the reply under about 40 KB.
