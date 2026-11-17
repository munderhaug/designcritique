---
name: critique
description: Human-centred design critique of mobile app mockups and prototypes (HTML, images, .zip exports, folders, Claude artifacts, Figma frames). Starts from the problem and the users, grounds the review in shipped apps (Mobbin) and established principles, captures screens at phone sizes in light, dark and large text, runs axe-core and mobile checks, then has independent critics (UX, UI and Impeccable) judge the screens. Use when asked to review, critique or audit app screens, a prototype or a flow.
---

# Critique mobile mockups

The order matters: **problem → references → evidence → independent judgement → report**.
Never judge screens before the problem is framed, and never let the session that made the
screens grade them.

`PLUGIN_ROOT` is two folders up from this skill's base directory (shown when the skill loads).
Scripts live in `PLUGIN_ROOT/scripts`, principles in `PLUGIN_ROOT/skills/principles/references`.
The tools this skill builds on, and how to install them, are listed in [companions.md](references/companions.md).

## 0. Setup (first run only)

Run `bash PLUGIN_ROOT/scripts/setup.sh`. It installs the scripts' dependencies and a browser if
needed, and reports which companions are installed. Then run
`node PLUGIN_ROOT/scripts/companions.mjs --project <project>` and keep its output for step 5.

## 1. Frame the problem

Find `PRODUCT.md` (the `product:` path in `mockups.yaml`, else the project root). If it's missing,
still has template placeholders, or names no key tasks, use the **frame** skill now. The critique
needs a problem, a primary user, a context of use and ranked key tasks. Open `[assumption]`s are
allowed; carry them into the report.

## 2. Gather the mockups

Create or update `mockups.yaml` (template: `PLUGIN_ROOT/templates/mockups.yaml`). How each input
type is handled is in [inputs.md](references/inputs.md):
- HTML files, PNG/JPG/WebP images, `.zip` exports and folders: point `file:` at them.
- Claude artifact links: pull them into `.designcritique/sources/<id>/` first.
- Figma frames: export a PNG through the Figma MCP server.
- A canvas with several phone frames on one page: set `phone_frame:` to the frame's CSS selector.

Order screens of one flow with `flow:` and `step:`. Put each screen's intent in `notes:`.

## 3. Capture and check (deterministic)

```bash
node PLUGIN_ROOT/scripts/capture/capture.mjs --config mockups.yaml   # prints RUN_DIR=...
node PLUGIN_ROOT/scripts/checks/run-checks.mjs --run <RUN_DIR>
```

Read `RUN_DIR/manifest.json` warnings. Look at one standard-light screenshot per screen. If a
page shows a desktop canvas with phone frames, or something is clearly mis-rendered, fix the
config and capture again.

## 4. References from shipped apps

If the Mobbin MCP is connected and `mockups.yaml` has no `references:`, gather comparable
screens and flows for the key tasks, as [mobbin.md](references/mobbin.md) describes. This
produces `RUN_DIR/references.md`. Otherwise use the configured references, or none.

## 5. Independent critics (judgement)

Start these in parallel, each with fresh context. None of them sees how the screens were made.

- **`ux-critic`** (this plugin's agent): task fit, cognitive walkthrough of every key task,
  Nielsen and Norman, content and errors.
- **`ui-critic`** (this plugin's agent): hierarchy, Gestalt, type, colour, Fitts and Hick,
  platform conventions, accessibility beyond the checks, AI tells; compares `group:` variants.
  Give it the companion guidance that applies, from step 0: `material-3` and `platform-audit`
  for Android, `platform-audit` for iOS, `expo-design-system` and `expo-native-ui` for Expo projects.
- **Impeccable**, if installed: a general-purpose agent that runs Impeccable's `critique` and
  `audit` on the HTML mockups and its detector (`npx impeccable detect --json <file>`), then
  converts the issues into the findings format with `"critic": "impeccable"`. Tell it where
  PRODUCT.md is, so Impeccable picks up the platform. If Impeccable isn't installed, skip this
  and note it in the reply with the install command.

Fill in [critic-brief.md](references/critic-brief.md) for each. With more than 8 screens, split
`ui-critic` into batches of up to 8; `ux-critic` always gets the whole flow. Save each JSON reply
unchanged to `RUN_DIR/critique/ux.json`, `ui.json` (`ui-2.json`, …) and `impeccable.json`. If a
reply isn't valid JSON, ask that agent once to return only the JSON.

## 6. Report

```bash
node PLUGIN_ROOT/scripts/report/render-report.mjs --run <RUN_DIR>
```

This merges and de-duplicates every finding (checks, critics, Impeccable) and writes
`findings.json`, `report.md` and `report.html` (screenshots with numbered markers) into the run folder.

## 7. Reply

Lead with the problem in one line and any open assumptions. Then give the verdict for each key
task, the top P0/P1 findings (five at most, each with its principle and the user it affects),
and a line on what works. Say which companions ran and which were missing. Point to
`report.html`. Don't edit the mockups unless asked. If asked to fix, work from P0 down and
capture again afterwards to confirm.

Severity rules: [severity.md](references/severity.md). Output format: [output-format.md](references/output-format.md).
