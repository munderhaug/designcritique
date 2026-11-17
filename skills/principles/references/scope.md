# Concept and scope

Sources: Christensen, Hall, Dillon & Duncan, *Competing Against Luck* (2016) (jobs to be done);
Anthony Ulwick, *What Customers Want* (2005) (outcome-driven innovation: jobs and desired
outcomes); Teresa Torres, *Continuous Discovery Habits* (2021) (opportunity solution trees:
every solution traces to an opportunity, compare several solutions per opportunity); Jeff Patton,
*User Story Mapping* (2014) (release slices: what belongs in this release). Methods are wired in
from Anthropic's product-management plugin (`product-brainstorming`, `write-spec`) when installed.

| ID | Principle | Look for |
|---|---|---|
| `SCOPE-NO-JOB` | Every feature serves a job, a problem part or a key task in PRODUCT.md | Features that trace to nothing (scope creep); "nice" extras on the main path |
| `SCOPE-GAP` | Every job and key task has a feature that serves it | A key task with no screen; a problem part nothing addresses |
| `SCOPE-ALTERNATIVE` | Each job is served the simplest effective way; a better-known solution is considered | A form where a default would do; a new screen where an inline control would do |
| `SCOPE-PHASE` | What's built fits its phase: the MVP holds the must-haves, later features wait | A "later" feature polished while an MVP must-have is missing |
| `SCOPE-OUT` | Out-of-scope items stay out | A feature PRODUCT.md lists as out of scope, present in the prototype |
