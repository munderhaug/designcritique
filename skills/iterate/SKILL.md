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
- Each round's mockups are saved under `.designcritique/iterate/round-N/` (below), so round 1 is
  the starting point and any round can be restored. A git commit first doesn't hurt.
- Read `gate:` and `iterate.max_rounds` (default 3) from `mockups.yaml`. Tell the person the
  bar and the round limit before starting; each round is a full critique.

## Each round

1. **Critique.** In the first round run the critique skill's steps 1–6; in later rounds steps 3,
   5 and 6 (the frame and the references from round 1 are reused). If the person asked to
   iterate on a whole-product review, run the review skill instead. Fresh critic agents every round, briefed only as critic-brief.md says: never
   tell them what was changed or what the last round found.
2. **Save and gate.** `node PLUGIN_ROOT/scripts/report/rounds.mjs save --config mockups.yaml
   --round N --run <RUN_DIR>` snapshots the files this run judged. Then
   `node PLUGIN_ROOT/scripts/report/gate.mjs --run <RUN_DIR>`. Exit 0: stop, it passed.
3. **Stop early** if this was the last round, or if, compared with the previous round, nothing was
   fixed, or more P0/P1 findings appeared than were fixed. Report the regression; don't keep going.
4. **Pick what to fix**, from `findings.json` (decisions already applied): P0 and P1 first, then
   whatever caps the lowest task score. Structure before motion: task fit, layout, hierarchy,
   copy, accessibility and tokens first; motion findings only once the static screens pass.
5. **Fix**, in a fresh general-purpose agent that is not one of the critics. Give it the findings
   (id, screen, evidence, recommendation), `PRODUCT.md`, `DESIGN.md` with the rule in
   `PLUGIN_ROOT/templates/CLAUDE-design-system.md`, the direction images if any, and the mockup
   HTML paths. It edits only those files, uses only DESIGN.md tokens and components (or stops and
   asks), fixes what the findings say rather than re-designing (no other design skill sets the
   direction), and returns which finding ids it addressed and how.
6. Next round.

## When the loop stops

Unless the last round passed, run `node PLUGIN_ROOT/scripts/report/rounds.mjs best --config
mockups.yaml`. It ranks the rounds (gate, then fewest P0, fewest P1, highest lowest task score,
fewest P2) and prints `BEST_ROUND=N`. If that isn't the last round, restore it with
`rounds.mjs restore --config mockups.yaml --round N` and say so: the loop keeps its best result,
not its last.

**Structure and scope are proposals, never edits.** When iterating on a review, findings at
`level: journey` or `system`, with `move_to`, or in the categories `ia`, `scope` or `journey` change what the product is or
where things live. Don't give them to the builder. List them as proposals for the person
(with the review's ids, such as M2 or S1) and let them decide with `/designcritique:decide`. Only
proposals the person has accepted may be built, and only when they ask for it.

Never dismiss or re-rate a finding yourself to get past the gate. When you think a finding is
wrong, ask the person; if they agree, they record it with `/designcritique:decide`.

## Reply

A table of rounds (P0 / P1 / P2 counts, lowest key-task score, gate), what
the builder changed, what is still open and why the loop stopped. Point to the
`report.html` of the round you kept, and say how to restore any other round
(`rounds.mjs restore --round N`; round 1 is the starting point).
