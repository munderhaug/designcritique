# Spec conformance

Sources: the owner's own specification is the standard here: PRODUCT.md (journeys, scope,
feature map and `## Navigation`, the navigation order), DESIGN.md (tokens and components), the
content guide and recorded decisions (`.designcritique/decisions.yaml`). DESIGN.md itself is
checked by the design-system checks (`DS-*` in design-systems.md).

| ID | Principle | Look for |
|---|---|---|
| `SPEC-NAV-ORDER` | Navigation shows the destinations, in the order, the spec gives | A tab bar or home list in a different order than `## Navigation` |
| `SPEC-JOURNEY` | Journeys follow the steps the spec gives | A sign-up or checkout flow with steps skipped or reordered |
| `SPEC-DRIFT` | The prototype doesn't contradict a written decision or spec rule | A screen that does what a recorded decision ruled out |
