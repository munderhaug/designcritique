---
description: Record your verdict on a critique finding (dismiss, re-rate or accept) so later runs and critics respect it
argument-hint: "<finding number> dismiss|P0-P3|accept [reason]"
---

Record a decision on a finding from the latest designcritique run: $ARGUMENTS

1. Find the newest run folder under the project's `.designcritique/runs/` (or the run named in the
   arguments) and the finding by its number in `report.md`.
2. Run `node <plugin root>/scripts/report/decide.mjs --run <RUN_DIR> --finding <n>` with
   `--dismiss --reason "…"`, `--severity P0-P3 --reason "…"` or `--accept`. A dismissal needs a
   reason; ask for one if none was given. Add `--eval-candidate` if the person says the critics
   keep getting this wrong.
3. Re-render the report (`scripts/report/render-report.mjs --run <RUN_DIR>`) and say what changed
   in the counts and the gate.

`decide.mjs --list --run <RUN_DIR>` shows which principles are dismissed or re-rated most: those
are calibration problems worth an eval case (see evals/README.md).
