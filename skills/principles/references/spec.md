# Spec conformance

Sources: the owner's own specification is the standard here: PRODUCT.md (journeys, scope,
feature map), DESIGN.md (tokens, information architecture, navigation order), the content guide
and recorded decisions (`.designcritique/decisions.yaml`). DESIGN.md itself is linted with
Google Labs' DESIGN.md tooling (github.com/google-labs-code/design.md).

| ID | Principle | Look for |
|---|---|---|
| `SPEC-DESIGN-LINT` | DESIGN.md is valid: references resolve, required roles exist, contrast holds | Broken token references; a missing primary colour |
| `SPEC-NAV-ORDER` | Navigation shows the destinations, in the order, the spec gives | A tab bar or home list in a different order than `## Navigation` |
| `SPEC-JOURNEY` | Journeys follow the steps the spec gives | A sign-up or checkout flow with steps skipped or reordered |
| `SPEC-DRIFT` | The prototype doesn't contradict a written decision or spec rule | A screen that does what a recorded decision ruled out |
