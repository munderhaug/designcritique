---
name: iterate
description: Fix HTML mobile mockups and re-critique them in rounds until they pass the designcritique gate (no open finding at the fail_on severity, every key task at the target score) or the round limit is reached. Each round uses fresh critics who don't know what changed. Use when asked to improve mockups until they're good, to loop or "cook" a design, or to fix the findings of a critique.
argument-hint: "[mockups.yaml] [--rounds N]"
---

# Iterate: fix, re-critique, repeat

The critique skill judges once. This skill closes the loop: a builder fixes the findings, fresh
critics judge the result cold, and the report compares each round with the last. The judgement
still comes from the critique skill's critics; this skill only orchestrates rounds.

`PLUGIN_ROOT` is two folders up from this skill's base directory.

Invoked as `/designcritique:iterate`, the input is: $ARGUMENTS

With no config given, use `mockups.yaml` in the current project. `--rounds N` overrides
`iterate.max_rounds`.

## Before the first round

- Ask first what to connect, as in the critique skill, step 0, once for the whole loop: the
  rounds don't stop to ask.

- Only HTML mockups can be fixed. Image inputs are critiqued but left alone; say so.
- Each round's mockups are saved under `.designcritique/iterate/round-N/` (below), so round 1 is
  the starting point and any round can be restored. A git commit first doesn't hurt.
- Read `gate:` and `iterate.max_rounds` (default 3) from `mockups.yaml`. Tell the person the
  bar and the round limit before starting; each round is a full critique.

## Each round

1. **Critique.** In the first round run the critique skill's steps 1–5. In later rounds, steps
   3–5 only: `run.mjs --config mockups.yaml` makes a new run folder; copy round 1's
   `references.md` into it and run `run.mjs --run <RUN_DIR> --from briefs`; run only stage 3 of
   the plan (the cold read and frame challenge were done in round 1, and the pause for the
   designer is skipped inside this loop); finish with `run.mjs --run <RUN_DIR> --finish` and
   `render-report.mjs --run <RUN_DIR> --base <the previous round's run>` so "Since last run"
   compares with that round. If the designer asked to iterate on a whole-product review, use the
   review skill the same way. Fresh reviewer agents every round, each given its brief unchanged:
   never tell them what was changed or what the last round found.
2. **Save and gate.** `node PLUGIN_ROOT/scripts/report/rounds.mjs save --config mockups.yaml
   --round N --run <RUN_DIR>` snapshots the files this run judged. Then
   `node PLUGIN_ROOT/scripts/report/gate.mjs --run <RUN_DIR>`. Exit 0: stop, it passed.
3. **Stop early** if this was the last round, or if, compared with the previous round, nothing was
   fixed, or more P0/P1 findings appeared than were fixed. Report the regression; don't keep going.
4. **Pick what to fix**, from `findings.json` (decisions already applied): P0 and P1 first, then
   whatever caps the lowest task score. Structure before motion: task fit, layout, hierarchy,
   copy, accessibility and tokens first; motion findings only once the static screens pass.
5. **Fix**, in a fresh general-purpose agent that is not one of the critics. Give it the findings
   (id, screen, evidence, recommendation, alternatives), `PRODUCT.md`, `DESIGN.md` with the rule
   in `PLUGIN_ROOT/templates/CLAUDE-design-system.md`, the direction images if any, and the
   mockup HTML paths. It edits only those files, uses only DESIGN.md tokens and components (or
   stops and asks), and fixes what the findings say rather than re-designing (no other design
   skill sets the direction). Two things before it returns:
   - **It looks at what it made.** After editing, it renders the screens it touched
     (`node PLUGIN_ROOT/scripts/capture/capture.mjs --config mockups.yaml --out <a scratch
     folder> --only <ids>`) and opens the standard and compact screenshots, light and dark. A fix
     nobody looked at isn't done: if the render shows a new problem, it fixes that too.
   - **It says why.** For every change: the finding id, what it changed, and why this way and
     not the alternative, in one or two sentences. A change it can't give a reason for is
     reverted. The designer reads these and can overrule any of them.
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
