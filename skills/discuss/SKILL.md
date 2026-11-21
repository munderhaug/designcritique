---
name: discuss
description: Argue a design critique finding with the critic that raised it. The designer makes their case, the critic answers from the evidence and holds, concedes or revises, and the exchange is recorded with the decision. Use when the designer disagrees with, questions or wants to push back on a finding in a designcritique report, or asks "why" about one.
argument-hint: "<finding number> <your case>"
---

# Discuss a finding

A critique a designer can't argue with is an audit. This skill lets them push back and get an
answer from the critic's side, with the evidence, instead of only recording a dismissal.

`PLUGIN_ROOT` is two folders up from this skill's base directory.

Invoked as `/designcritique:discuss`, the input is: $ARGUMENTS

1. **Find the finding** by its number in the newest run's `report.md` (or the run named), in
   `RUN_DIR/findings.json`. If the designer gave no case, ask what they disagree with: the
   evidence, the severity, the principle, or that it matters for these users.
2. **Check it's worth a critic.** A deterministic check (source `check`, `motion`, `detector:*`)
   measured something: show the measurement and its evidence yourself and discuss whether it
   matters here. Go to step 3 only for a critic's finding.
3. **Put the case to the critic.** Spawn a fresh agent of the kind that raised it
   (`designcritique:design-reviewer` for `anthropic-design`, the lens agent for `ia`, `scope`,
   `system`, a general-purpose agent for `impeccable`), on the judge model, with only this:

   ```
   You raised this finding in a design critique. The designer disagrees. Reconsider it honestly.

   Frame: <RUN_DIR>/framing.md
   The finding (as you wrote it): <id, title, rule and basis, severity, evidence, impact, recommendation, alternatives>
   Screenshots it concerns: <paths>
   Severity rules: <PLUGIN_ROOT>/skills/critique/references/severity.md
   The designer's case: "<their words, unchanged>"

   Look at the screenshots again. Then answer in JSON only:
   { "stance": "hold | concede | revise", "severity": "P0-P3 when revising", "reply": "Your answer to the designer's case: what you grant, what you don't, and the evidence. Two to five sentences." }
   Concede when their case shows the finding was wrong or doesn't matter for these users. Revise
   when it holds but at another severity. Hold when the evidence still supports it, and say what
   would change your mind. Don't concede to be agreeable; don't hold to be consistent.
   ```
4. **Tell the designer the answer**, in the critic's words, and add your own view if it differs:
   you are a second mind here, not a messenger.
5. **Record it:**

   ```bash
   node PLUGIN_ROOT/scripts/report/decide.mjs --run <RUN_DIR> --finding <n> \
     --argue "<the designer's case>" --reply "<the critic's reply>" --stance hold|concede|revise [--severity P2]
   node PLUGIN_ROOT/scripts/report/render-report.mjs --run <RUN_DIR>
   ```

   `concede` dismisses the finding, `revise` re-rates it, `hold` keeps it open; the exchange is
   shown under the finding either way. If the designer still disagrees after a `hold`, the
   decision is theirs: record it with `/designcritique:decide`.

Never concede on a critic's behalf, and never dismiss or re-rate a finding yourself.
