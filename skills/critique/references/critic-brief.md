# Reviewer briefs

Briefs are written by `scripts/report/briefs.mjs` (run by `scripts/run.mjs`), from the run's
manifest, frame and coverage: `RUN_DIR/briefs/<name>.txt`, with the order in
`RUN_DIR/briefs/plan.json`. The text lives in `scripts/lib/briefs.mjs`; change it there, then
re-run the critic evals (CLAUDE.md). Give each reviewer its brief unchanged.

What the generator decides, so nobody does it by hand:

- **Stages.** Cold read, then the frame challenge, then the critics. Reviewers in a stage run in
  parallel and never see each other's output.
- **Evidence.** Every critic gets the same: the frame snapshot (`RUN_DIR/framing.md`, never the
  project's live file), tokens, content guide, references, direction images, decisions, the
  gate and `checks/all.json`. The cold reader gets numbered copies of the screenshots and
  nothing else.
- **Batches and coverage.** Up to eight screens: one design-reviewer, coverage `whole`. More:
  one reviewer walks every key task across all screens (standard light only) and scores them,
  and batches of eight look at every variant with coverage `partial`, which never gates.
  `save-critique.mjs --coverage` stamps it, whatever the reviewer wrote.
- **Whole-product reviews.** Critics get one screen per screen family plus the journeys in step
  order; the lens reviewers also get coverage, the graph and the owner's own rules.
- **Models.** `critics.judge_model` for every reviewer when set. Otherwise pick a model other
  than the one that made the mockups: the model that wrote the screens is the worst judge of them.

## External judges (optional)

Two critics on the same model share blind spots. For each name in `critics.external`
(mockups.yaml) the plan has an `external-<name>` entry with the design-reviewer's brief under
that name. Give the file to the tool and save its reply with the `save` command, for example
for `codex` (OpenAI's CLI):

```bash
codex exec --sandbox read-only "$(cat <RUN_DIR>/briefs/external-codex.txt)" > /tmp/reply.txt
node PLUGIN_ROOT/scripts/report/save-critique.mjs --run <RUN_DIR> --critic external-codex --coverage whole --from /tmp/reply.txt
```

The tool must be able to read the method and principle files the brief names. Its task scores
count in the gate. If the tool isn't installed or can't be reached, say so and carry on.
