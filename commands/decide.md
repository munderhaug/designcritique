---
description: Record your verdict on a critique finding (dismiss, re-rate or accept) so later runs and critics respect it
argument-hint: "<finding number | proposal id | challenge id> dismiss|P0-P3|accept|reject|defer|<your answer> [reason]"
---

Record a decision on a finding from the latest designcritique run: $ARGUMENTS

1. Find the newest run folder under the project's `.designcritique/runs/` (or the run named in the
   arguments) and the finding by its number in `report.md`.
2. Run `node <plugin root>/scripts/report/decide.mjs --run <RUN_DIR> --finding <n>` with
   `--dismiss --reason "…"`, `--severity P0-P3 --reason "…"` or `--accept`. A dismissal needs a
   reason; ask for one if none was given. Add `--eval-candidate` if the person says the critics
   keep getting this wrong.
   For a proposal from a whole-product review (an id like `M2` or `S1` in "Cut, add or move"),
   run `decide.mjs --run <RUN_DIR> --proposal <id>` with `--accept`, `--reject` or `--defer`.
   Proposals are never applied automatically; accepting one records it as agreed work.
   For a question the critics put to you (an id like `C2` in "Questions for you"), run
   `decide.mjs --run <RUN_DIR> --challenge <id> --answer "…"`: your answer is shown in the report
   and given to later runs, so it isn't asked again without new evidence.
   To argue a finding with its critic instead of ruling on it, use `/designcritique:discuss`.
3. Re-render the report (`scripts/report/render-report.mjs --run <RUN_DIR>`) and say what changed
   in the counts and the gate.

`decide.mjs --list --run <RUN_DIR>` shows which principles are dismissed or re-rated most: those
are calibration problems worth an eval case (see evals/README.md).
