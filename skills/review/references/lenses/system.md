# Lens: system (consistency, logic and states, spec)

Sources: Nielsen's consistency and standards (`NN-H4`); Covert (2014); Podmajersky, *Strategic
Writing for UX* (2019); Frost, *Atomic Design* (2016); Hurff, *Designing Products People Love*
(2016) (the UI stack: ideal, empty, error, partial, loading). Principle IDs: `CONS-*`,
`STATE-*`, `SPEC-*`.

When installed, use Anthropic's `design-system` skill (consistency audit) and Impeccable's
`harden` reference (empty, loading, error, offline, extreme data) as the method; paths are in
your brief.

1. **Consistency.** Start from `consistency.json` (button styles, icons and their meanings,
   terms, amount formats, figures that disagree). Confirm or dismiss each with what the users
   would experience, then look for what a script can't see: the same problem solved two ways
   (`CONS-PATTERN`), the same object shown differently, voice that changes between screens.
2. **Logic and states.** Use the state matrix in `coverage.json`. For each screen family that
   serves a key task, which of ideal, empty, error, partial, loading, offline and first run were
   seen? A state not seen is "not covered", and goes in `summary` as a capture request. Where a
   seen state is wrong (empty screen with no next step, error that loses input), it's a finding.
   Check that figures agree across screens (`CONS-FIGURES`).
3. **Deceptive patterns** (`ETHICS-*`; Gray et al. 2018, Mathur et al. 2019, Brignull 2023).
   The checks catch pre-ticked consent, lopsided accept/decline choices and confirmshaming on
   single screens. Across journeys, look for what they can't: cancelling or opting out harder
   than joining, costs or renewals revealed late, false urgency or scarcity, forced actions and
   repeated prompts after "not now". Ask Thaler & Sunstein's question: would users endorse this
   as judged by themselves?
4. **Spec conformance.** Compare the prototype with the owner's own rules: DESIGN.md, the content
   guide, `## Navigation`, the journeys in PRODUCT.md and recorded decisions. Drift is
   `SPEC-DRIFT`, citing the rule and where it's broken.

Return `"critic": "system"`.
