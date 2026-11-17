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

This skill adds what they don't provide: mobile capture and checks for mockups, independence
between critics, a merged report, and build recommendations from a cited catalog.

`PLUGIN_ROOT` is two folders up from this skill's base directory. Scripts are in
`PLUGIN_ROOT/scripts`, the citation index in `PLUGIN_ROOT/skills/principles/references`, and
tool details in [companions.md](references/companions.md).

## 0. Setup

Run `bash PLUGIN_ROOT/scripts/setup.sh`, then
`node PLUGIN_ROOT/scripts/companions.mjs --project <project>` and keep the output for step 5.
If Impeccable or the Anthropic design plugin is missing, tell the user once, with the install
commands from setup's output (`setup.sh --install-companions` installs both), then continue
with whatever is available.

## 1. Frame the problem

Use the **frame** skill unless `PRODUCT.md` already has Platform, Users, Product Purpose, a
Problem and ranked Key Tasks. It runs Impeccable's `init` and adds the human-centred sections.

## 2. Gather the mockups

Create or update `mockups.yaml` (template: `PLUGIN_ROOT/templates/mockups.yaml`). Inputs are
covered in [inputs.md](references/inputs.md): HTML, images, `.zip`, folders, Claude artifacts
(pulled into `.designcritique/sources/<id>/`), Figma frames (exported through the Figma MCP),
canvases with several phone frames (`phone_frame:`), and screenshots from a simulator or device
(MobileBuildMCP, Android CLI, Expo MCP, mobile-mcp). Order flows with `flow:` and `step:`, and
put each screen's intent in `notes:`. If the person has chosen a direction, put its 9–12
reference images under `taste:`.

## 3. Capture and check (deterministic)

```bash
node PLUGIN_ROOT/scripts/capture/capture.mjs --config mockups.yaml   # prints RUN_DIR=...
node PLUGIN_ROOT/scripts/checks/run-checks.mjs --run <RUN_DIR>
```

Read the manifest warnings and look at one standard-light screenshot per screen. Fix
mis-renders (phone-frame canvases, missing assets) and capture again.

The checks also review `DESIGN.md` itself: text/surface token contrast, colour roles, a
4-based spacing scale, and whether it covers the eight essentials of the Smpl design-system
guide (buttons and their states, forms, navigation, empty and error states, voice).

**Motion (HTML mockups).** Static screenshots can't show motion, so use the transitions.dev
scanner (Jakub Antalik; deterministic, local, no account):

```bash
node PLUGIN_ROOT/scripts/checks/motion.mjs plan --run <RUN_DIR>    # prints one scan command per mockup folder
npx transitions-agent --json --dir "<folder>" > "<RUN_DIR>/motion/scan-1.json"   # as printed
node PLUGIN_ROOT/scripts/checks/motion.mjs import --run <RUN_DIR>
```

Its duration scale is a web scale, so off-scale timing stays P3; missing reduced-motion
handling and overlays without transitions are P2. Skip this step if `npx` can't reach npm.

## 4. References from shipped apps

Unless `mockups.yaml` lists `references:`, gather comparable screens and flows for the key
tasks from Mobbin or Refero, whichever is connected, as [references.md](references/references.md)
describes. This writes `RUN_DIR/references.md`.

## 5. Two independent critiques, in parallel

Neither sees the other's output or how the screens were made. Both briefs name the decisions
file (`.designcritique/decisions.yaml`), the taste references and the gate.

- **design-reviewer** (this plugin's read-only agent), on the model in `critics.judge_model`, or
  a model other than the one that made the mockups. Fill in [critic-brief.md](references/critic-brief.md)
  with the Anthropic design-plugin SKILL.md paths from step 0, plus companion guidance for the
  platform (Material 3, Expo or platform-audit skills, when installed). With more than 8 screens,
  run one reviewer per batch of 8, and give one of them the whole flow for the walkthrough.
- **Impeccable critique**, in a fresh general-purpose agent, using the Impeccable brief in
  critic-brief.md. On `ios`, `android` and `adaptive` platforms Impeccable runs its design review
  without its web detector, by its own rules. Skip this critic if Impeccable isn't installed.
- **External judges**, one per name in `critics.external` (for example `codex`), as described at
  the end of critic-brief.md. Skip any that isn't installed and say so.

Save each JSON reply unchanged to `RUN_DIR/critique/anthropic-design.json` (`-2`, … for batches),
`RUN_DIR/critique/impeccable.json` and `RUN_DIR/critique/external-<name>.json`. This plugin's hook validates each file as it's saved
(schema, screen ids, principle IDs) and reports problems back; fix them, asking the critic
again if needed. `node PLUGIN_ROOT/scripts/report/validate-critique.mjs <file>` does the same by hand.

## 6. Report and build stack

```bash
node PLUGIN_ROOT/scripts/report/render-report.mjs --run <RUN_DIR>
```

This merges all findings and writes `findings.json`, `report.md` and `report.html`. If an
earlier run of the same mockups exists, it adds **Since last run**: fixed, new and still-open
findings (`--base <run>` to choose the run, `--no-compare` to skip). The report ends with **To build this**: design system and components, tokens, platform skills,
design-quality skills, design inputs and device checks for the platform and stack in
PRODUCT.md. Every pick comes from `PLUGIN_ROOT/catalog/stack.yaml` with its source, ranked by
what the findings show. Never add tools that aren't in the catalog; propose catalog additions
separately, with sources.

The report applies the person's decisions and states whether the run passes the **gate**
(`gate:` in mockups.yaml: no open finding at `fail_on` or worse, every key task at or above
`target_score` by the lowest critic's score). `node PLUGIN_ROOT/scripts/report/gate.mjs --run
<RUN_DIR>` exits 2 with the reasons when it fails, for CI or a Stop hook.

## 7. Reply

The problem in one line, plus open assumptions; the gate result; what changed since the last
run, if there was one; the verdict and lowest score for each key task; the taste score, if any; the top P0/P1
findings (five at most, each with its principle and the user it affects); what works; the first
two build-stack steps; which critics ran, on which models, and which were missing. Point to
`report.html`. Don't edit the mockups unless asked; `/designcritique:iterate` fixes and
re-critiques in rounds.

When the person disagrees with a finding (a false alarm, out of scope, wrong severity), record it
with `node PLUGIN_ROOT/scripts/report/decide.mjs` (or `/designcritique:decide`) rather than only
noting it in chat, then re-render the report.

Severity: [severity.md](references/severity.md). Output format: [output-format.md](references/output-format.md).
