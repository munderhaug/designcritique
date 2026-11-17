---
name: critique
description: Human-centred design critique of mobile app mockups and prototypes (HTML, images, .zip exports, folders, Claude artifacts, Figma frames). Frames the problem first (Impeccable init), grounds the review in shipped apps (Mobbin or Refero), captures screens at phone sizes, runs axe-core and mobile checks, then runs two independent critiques - Impeccable's critique and Anthropic's design-plugin methods - and ends with a cited build stack. Use when asked to review, critique or audit app screens, a prototype or a flow.
---

# Critique mobile mockups

The order matters: **problem → references → evidence → independent judgement → report and
build stack**. Judgement comes from proven tools, not from this skill:
- **Impeccable** (Paul Bakaus): `critique`, with Nielsen scoring, cognitive load and persona
  walk-throughs, and native iOS/Android references.
- **Anthropic's design plugin**: `design-critique`, `accessibility-review` and `ux-copy`, applied
  by this plugin's read-only `design-reviewer` agent together with the cognitive walkthrough of
  each key task.

For the whole product (where things belong, journeys across screens, scope, system
consistency), use the **review** skill (`/designcritique:review`); it costs more.

This skill adds what they don't provide: mobile capture and checks for mockups, independence
between critics, a merged report, and build recommendations from a cited catalog. Other design
skills in the session (for example Refero's `refero-design`, which calls itself the default for
all design work) don't change this workflow and are never given to a critic.

`PLUGIN_ROOT` is two folders up from this skill's base directory. Scripts are in
`PLUGIN_ROOT/scripts`, the citation index in `PLUGIN_ROOT/skills/principles/references`, and
tool details in [companions.md](references/companions.md).

## 0. Setup

Run `bash PLUGIN_ROOT/scripts/setup.sh`, then
`node PLUGIN_ROOT/scripts/companions.mjs --project <project>` and keep the output for step 5.
If Impeccable or the Anthropic design plugin is missing, offer once to run
`bash PLUGIN_ROOT/scripts/setup.sh --install-companions` (it falls back to their GitHub sources
when an installer can't download). If the person declines, continue with what is available and
say which critic ran in fallback mode.

Then check the reference sources the same way, before any critique work: a connected MCP server
can still refuse searches (Mobbin and Refero need a paid plan). Run the one-call probe in
[references.md](references/references.md#check-the-source-first) for Mobbin, then Refero, and tell
the person the result up front: connected and working, connected but needs a paid plan, or not
connected. Use the first that works in step 4.

## 1. Frame the problem

Use the **frame** skill unless `PRODUCT.md` already has Platform, Users, Product Purpose, a
Problem and ranked Key Tasks. It runs Impeccable's `init` and adds the human-centred sections.

## 2. Gather the mockups

Create or update `mockups.yaml` (template: `PLUGIN_ROOT/templates/mockups.yaml`). Inputs are
covered in [inputs.md](references/inputs.md): HTML, images, `.zip`, folders, Claude artifacts
(pulled into `.designcritique/sources/<id>/`), Figma frames (exported through the Figma MCP),
canvases with several phone frames (`phone_frame:`), and screenshots from a simulator or device
(MobileBuildMCP, Android CLI, Expo MCP, mobile-mcp). Order flows with `flow:` and `step:`, and
put each screen's intent in `notes:`. If the person has chosen a visual direction, its images go
under `taste:`; critics see them as context, never as a score.

## 3. Capture and check (deterministic)

```bash
node PLUGIN_ROOT/scripts/capture/capture.mjs --config mockups.yaml   # prints RUN_DIR=...
node PLUGIN_ROOT/scripts/checks/run-all.mjs --run <RUN_DIR>
```

Read the manifest warnings and look at one standard-light screenshot per screen. Fix
mis-renders (phone-frame canvases, missing assets) and capture again. `run-all` runs every check
(screens, DESIGN.md, motion, detectors) and writes `checks/all.json` for the critics to skip;
what each finds: [checks.md](references/checks.md).

## 4. References from shipped apps

Unless `mockups.yaml` lists `references:`, gather comparable screens and flows for the key
tasks from Mobbin or Refero, whichever is connected, as [references.md](references/references.md)
describes. This writes `RUN_DIR/references.md`.

## 5. Two independent critiques, in parallel

Neither sees the other's output or how the screens were made. Fill in
[critic-brief.md](references/critic-brief.md) for each: it names the decisions file, the key
tasks by ID (`T1`, `T2`, … from PRODUCT.md), `checks/all.json`, the direction images if any and
the gate. Run every critic on `critics.judge_model`, or a model other than the one that made the
mockups.

- **design-reviewer** (this plugin's read-only agent), with the Anthropic design-plugin SKILL.md
  paths from step 0 and companion guidance for the platform (Material 3 or Expo skills). With
  more than 8 screens, batches of 8 score tasks as `partial`; one more reviewer with every screen
  of the key tasks scores them as `whole`.
- **Impeccable critique**, in a fresh general-purpose agent, using the Impeccable brief. It
  doesn't run Impeccable's detector (step 3 did) and sets severity by severity.md. Skip it if
  Impeccable isn't installed.
- **External judges**, one per name in `critics.external` (for example `codex`), as described at
  the end of critic-brief.md. Skip any that isn't installed and say so.

Save each JSON reply unchanged to `RUN_DIR/critique/anthropic-design.json` (`-2`, … for
batches), `impeccable.json` and `external-<name>.json`. The plugin's hook validates each file as
it's saved and reports problems back; fix them, asking the critic again if needed
(`node PLUGIN_ROOT/scripts/report/validate-critique.mjs <file>` by hand).

## 6. Report and build stack

```bash
node PLUGIN_ROOT/scripts/report/render-report.mjs --run <RUN_DIR>
```

This merges all findings (one per problem) and writes `findings.json`, `report.md` and
`report.html`, with **Since last run** when an earlier run of the same mockups exists
(`--base <run>`, `--no-compare`). It ends with **To build this**: picks for the platform and
stack in PRODUCT.md, only from `PLUGIN_ROOT/catalog/stack.yaml`, each with its source. Never add
tools that aren't in the catalog; propose catalog additions separately, with sources.

The report applies the person's decisions and states whether the run passes the **gate**
(`gate:` in mockups.yaml: no open finding at `fail_on` or worse, and every key task scored, at or
above `target_score`, by the lowest score of the critics that walked the whole task). `node PLUGIN_ROOT/scripts/report/gate.mjs --run
<RUN_DIR>` exits 2 with the reasons when it fails, for CI or a Stop hook.

## 7. Reply

The problem in one line, plus open assumptions; the gate result; what changed since the last
run, if there was one; the verdict and lowest score for each key task; the top P0/P1
findings (five at most, each with its principle and the user it affects); what works; the first
two build-stack steps; which critics ran, on which models, and which were missing. Point to
`report.html`. Don't edit the mockups unless asked; `/designcritique:iterate` fixes and
re-critiques in rounds.

When the person disagrees with a finding (a false alarm, out of scope, wrong severity), record it
with `node PLUGIN_ROOT/scripts/report/decide.mjs` (or `/designcritique:decide`) rather than only
noting it in chat, then re-render the report.

Severity: [severity.md](references/severity.md). Output format: [output-format.md](references/output-format.md).
