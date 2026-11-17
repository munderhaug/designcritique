---
name: iterate
description: Fix HTML mobile mockups and re-critique them in rounds until they pass the designcritique gate (no open finding at the fail_on severity, every key task at the target score) or the round limit is reached. Each round uses fresh critics who don't know what changed. Use when asked to improve mockups until they're good, to loop or "cook" a design, or to fix the findings of a critique.
---

# Iterate: fix, re-critique, repeat

The critique skill judges once. This skill closes the loop: a builder fixes the findings, fresh
critics judge the result cold, and the report compares each round with the last. The judgement
still comes from the critique skill's critics; this skill only orchestrates rounds.

`PLUGIN_ROOT` is two folders up from this skill's base directory.

## Before the first round

- Only HTML mockups can be fixed. Image inputs are critiqued but left alone; say so.
- Make sure the mockups can be restored: a git commit, or a copy under `.designcritique/before/`.
- Read `gate:` and `iterate.max_rounds` (default 3) from `mockups.yaml`. Tell the person the
  bar and the round limit before starting; each round is a full critique.

## Each round

1. **Critique.** Run the critique skill in full, steps 3–6 (frame and references once, in the
   first round). Fresh critic agents every round, briefed only as critic-brief.md says: never
   tell them what was changed or what the last round found.
2. **Gate.** `node PLUGIN_ROOT/scripts/report/gate.mjs --run <RUN_DIR>`. Exit 0: stop, it passed.
3. **Stop early** if this was the last round, or if, compared with the previous round, nothing was
   fixed, or more P0/P1 findings appeared than were fixed. Report the regression; don't keep going.
4. **Pick what to fix**, from `findings.json` (decisions already applied): P0 and P1 first, then
   whatever caps the lowest task score. Structure before motion: task fit, layout, hierarchy,
   copy, accessibility and tokens first; motion findings only once the static screens pass.
5. **Fix**, in a fresh general-purpose agent that is not one of the critics. Give it the findings
   (id, screen, evidence, recommendation), `PRODUCT.md`, `DESIGN.md` with the rule in
   `PLUGIN_ROOT/templates/CLAUDE-design-system.md`, the taste references if any, and the mockup
   HTML paths. It edits only those files, uses only DESIGN.md tokens and components (or stops and
   asks), and returns which finding ids it addressed and how.
6. Next round.

Never dismiss or re-rate a finding yourself to get past the gate. When you think a finding is
wrong, ask the person; if they agree, they record it with `/designcritique:decide`.

## Reply

A table of rounds (P0 / P1 / P2 counts, lowest key-task score, taste score if any, gate), what
the builder changed, what is still open and why the loop stopped. Point to the last
`report.html`, and say how to restore the starting mockups.
