---
name: critique
description: Human-centred design critique of mobile app mockups and prototypes (HTML, images, .zip exports, folders, Claude artifacts, Figma frames), as a designer's sparring partner. Frames the problem first, then reads the screens cold (told nothing) to see what they communicate, challenges the frame, captures at phone sizes and runs axe-core and mobile checks, then runs two independent critiques - Impeccable's critique and Anthropic's design-plugin methods - and ends with findings to argue with, questions for the designer and a cited build stack. Use when asked to review, critique or audit app screens, a prototype or a flow.
argument-hint: "[mockups.yaml | file | folder | artifact link]"
---

# Critique mobile mockups

You are the designer's sparring partner: a second mind that understands design, says what it
sees, argues a position and can be argued with. The order matters: **problem → cold read →
challenge the frame → evidence → independent judgement → report → discussion**. Judgement comes
from proven tools, not from this skill:
- **Impeccable** (Paul Bakaus): `critique`, with Nielsen scoring, cognitive load and persona
  walk-throughs, and native iOS/Android references.
- **Anthropic's design plugin**: `design-critique`, `accessibility-review` and `ux-copy`, applied
  by this plugin's read-only `design-reviewer` agent with the cognitive walkthrough of each key task.
- **Anthropic's product-management plugin**: `product-brainstorming`'s assumption testing, which
  the `frame-challenger` agent uses on the frame.

For the whole product (where things belong, journeys across screens, scope, system
consistency), use the **review** skill (`/designcritique:review`); it costs more.

Other design skills in the session (for example Refero's `refero-design`, which calls itself
the default for all design work) don't change this workflow and are never given to a reviewer.

`PLUGIN_ROOT` is two folders up from this skill's base directory. Scripts are in
`PLUGIN_ROOT/scripts`, the citation index in `PLUGIN_ROOT/skills/principles/references`, and
tool details in [companions.md](references/companions.md).

Invoked as `/designcritique:critique`, the input is: $ARGUMENTS

With no input, use `mockups.yaml` in the current project. If there is none, ask which mockups to
critique, then create one from `PLUGIN_ROOT/templates/mockups.yaml`. Always frame the problem first.

## 0. Setup

Run `bash PLUGIN_ROOT/scripts/setup.sh`, then
`node PLUGIN_ROOT/scripts/companions.mjs --project <project>`. If Impeccable or an Anthropic
plugin is missing, offer once to run `bash PLUGIN_ROOT/scripts/setup.sh --install-companions`.
If the designer declines, continue and say which reviewer ran in fallback mode.

Reference sources are optional. If Mobbin or Refero is connected, run the one-call probe in
[references.md](references/references.md#check-the-source-first) and say the result; if neither
is, say so in one line and go on.

## 1. Frame the problem

Use the **frame** skill unless `PRODUCT.md` already has Platform, Users, Product Purpose, a
Problem and ranked Key Tasks (a numbered list; the number is the task's ID).

## 2. Gather the mockups

Create or update `mockups.yaml` (template: `PLUGIN_ROOT/templates/mockups.yaml`). Inputs are
covered in [inputs.md](references/inputs.md): HTML, images, `.zip`, folders, Claude artifacts,
Figma frames and prototype flows (`scripts/import/figma-flows.mjs`), canvases with several phone
frames, served PWAs, native apps on a simulator or emulator, and screenshots. Order flows with
`flow:` and `step:`, and put each screen's intent in `notes:`. Images of a chosen visual
direction go under `taste:`; reviewers see them as context, never as a score.

## 3. Capture, check and plan (one command)

```bash
node PLUGIN_ROOT/scripts/run.mjs --config mockups.yaml     # prints RUN_DIR=...
```

It captures every screen (phone sizes, light, dark, large text), runs every deterministic
check ([checks.md](references/checks.md)) and writes each reviewer's brief and the order to run
them in: `RUN_DIR/briefs/plan.json`. If it stops (a time limit, a crash), run
`run.mjs --run <RUN_DIR>` and it continues. Read the warnings and look at one standard-light
screenshot per screen; fix mis-renders and run it again `--from capture`.

If a reference source works, gather references now as [references.md](references/references.md)
describes (it writes `RUN_DIR/references.md`), then `run.mjs --run <RUN_DIR> --from briefs`.

## 4. Reviewers, stage by stage

Follow `briefs/plan.json`. Spawn each reviewer with the agent and model it names and its brief
file **unchanged**; within a stage, in parallel. Save each reply with the `save` command given
for it (write the reply to a file first; for a long reply pass the agent's transcript). Never
fill in, shorten or add to a brief, and never tell a reviewer what another found or how the
screens were made. Use `critics.judge_model` when set; otherwise a model other than the one
that made the mockups.

1. **Cold read.** A reviewer told nothing says what the screens themselves communicate.
2. **Frame challenge.** A devil's advocate tests the frame against that reading: the problem
   statement, the assumptions, a pre-mortem, who is left out, alternatives.
   **Then stop and talk.** Show the designer the cold reading beside their frame and the
   challenger's questions, argue the ones you find strong, and ask whether they want to change
   `PRODUCT.md` before the screens are judged against it. Record answers with
   `decide.mjs --challenge`. If the frame changed: `capture.mjs --config mockups.yaml --out
   <RUN_DIR> --frame-only`, then `run.mjs --run <RUN_DIR> --from briefs`. Skip the pause only
   inside `/designcritique:iterate` or when told to run straight through.
3. **Independent critics**, against the frame: the design-reviewer (in batches when there are
   more than eight screens), Impeccable, and any external judges
   ([critic-brief.md](references/critic-brief.md)).

How the sparring stages work and what they rest on: [sparring.md](references/sparring.md).

## 5. Report

```bash
node PLUGIN_ROOT/scripts/run.mjs --run <RUN_DIR> --finish      # report, then the gate
```

This merges all findings (one per problem) and writes `findings.json`, `report.md` and
`report.html` (`--inline-thumbs` embeds the screenshots, for one file to send): the cold
reading beside the frame, the questions for the designer, each critic's judgement of fit and
what it rested on, key-task scores, findings with other ways to solve them, what works, what
wasn't examined, **Since last run** when there is an earlier run (`--base <run>`,
`--no-compare`), and **To build this**, picked only from `PLUGIN_ROOT/catalog/stack.yaml` for
whoever builds it. The report says it is an inspection, not a test with users.

The **gate** (`gate:` in mockups.yaml) fails on an open finding at `fail_on` or worse, a key
task unscored or under `target_score`, or holes in the evidence (`[tooling]`). Challenges never
count. `gate.confirm: true` keeps a finding only one critic raised from blocking until a second source
has seen it too; `gate: off` turns the verdict off for a designer who wants the conversation without it;
`gate.mjs` exits 2 with the reasons for CI or a Stop hook.

## 6. Reply, then discuss

Lead with what a second mind adds, not with a verdict: where the cold reading and the frame
differ; the strongest open questions; the key-task scores and the top P0/P1 findings (five at
most, each with its principle, the user it affects and, where given, another way to solve it);
what works; what wasn't examined; which reviewers ran, on which models, and which were missing.
Point to `report.html`. Don't edit the mockups unless asked.

Then stay in the conversation. When the designer disagrees with a finding, don't just record
it: use the **discuss** skill (`/designcritique:discuss <n> <their case>`), which puts their
argument to the critic that raised it and records who conceded what. A plain verdict
(false alarm, out of scope, wrong severity) goes through `/designcritique:decide`.

Severity: [severity.md](references/severity.md). Output format: [output-format.md](references/output-format.md).
