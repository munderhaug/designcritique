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
and canvases with several phone frames (`phone_frame:`). Order flows with `flow:` and `step:`,
and put each screen's intent in `notes:`.

## 3. Capture and check (deterministic)

```bash
node PLUGIN_ROOT/scripts/capture/capture.mjs --config mockups.yaml   # prints RUN_DIR=...
node PLUGIN_ROOT/scripts/checks/run-checks.mjs --run <RUN_DIR>
```

Read the manifest warnings and look at one standard-light screenshot per screen. Fix
mis-renders (phone-frame canvases, missing assets) and capture again.

## 4. References from shipped apps

Unless `mockups.yaml` lists `references:`, gather comparable screens and flows for the key
tasks from Mobbin or Refero, whichever is connected, as [references.md](references/references.md)
describes. This writes `RUN_DIR/references.md`.

## 5. Two independent critiques, in parallel

Neither sees the other's output or how the screens were made.

- **design-reviewer** (this plugin's read-only agent). Fill in [critic-brief.md](references/critic-brief.md)
  with the Anthropic design-plugin SKILL.md paths from step 0, plus companion guidance for the
  platform (Material 3, Expo or platform-audit skills, when installed). With more than 8 screens,
  run one reviewer per batch of 8, and give one of them the whole flow for the walkthrough.
- **Impeccable critique**, in a fresh general-purpose agent, using the Impeccable brief in
  critic-brief.md. On `ios`, `android` and `adaptive` platforms Impeccable runs its design review
  without its web detector, by its own rules. Skip this critic if Impeccable isn't installed.

Save each JSON reply unchanged to `RUN_DIR/critique/anthropic-design.json` (`-2`, … for batches)
and `RUN_DIR/critique/impeccable.json`. If a reply isn't valid JSON, ask once for only the JSON.

## 6. Report and build stack

```bash
node PLUGIN_ROOT/scripts/report/render-report.mjs --run <RUN_DIR>
```

This merges all findings and writes `findings.json`, `report.md` and `report.html`. The report
ends with **To build this**: design system and components, tokens, platform skills,
design-quality skills, design inputs and device checks for the platform and stack in
PRODUCT.md. Every pick comes from `PLUGIN_ROOT/catalog/stack.yaml` with its source, ranked by
what the findings show. Never add tools that aren't in the catalog; propose catalog additions
separately, with sources.

## 7. Reply

The problem in one line, plus open assumptions; the verdict for each key task; the top P0/P1
findings (five at most, each with its principle and the user it affects); what works; the first
two build-stack steps; which critics ran and which were missing. Point to `report.html`. Don't
edit the mockups unless asked.

Severity: [severity.md](references/severity.md). Output format: [output-format.md](references/output-format.md).
