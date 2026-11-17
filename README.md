# designcritique

Human-centred design critique for mobile app mockups and prototypes, as a Claude Code plugin.

It starts with the problem the app solves and who it is for, compares the screens with shipped
apps, collects objective evidence at real phone sizes, and then has independent critics judge
the screens against established design research. You get a report with findings marked on the
screenshots, each tied to a principle and to the user and task it affects.

```
frame the problem → references → capture + checks → independent critics → report
   PRODUCT.md        Mobbin       Playwright, axe     UX · UI · Impeccable   report.html
```

## Why it works this way

- **Problem first.** Screens are judged against `PRODUCT.md`: the problem, the primary user,
  their context of use, and ranked key tasks (ISO 9241-210 / 9241-11, jobs to be done).
  Anything inferred rather than confirmed is labelled as an assumption.
- **Evidence before opinion.** Every HTML screen is rendered at small and standard phone sizes
  in light, dark and large text. Accessibility (axe-core), tap targets, text scaling, overflow,
  safe areas and design-token drift are checked by code, not by a model.
- **Independent judgement.** The critics are read-only agents with fresh context. They never
  see how the screens were made, so the maker doesn't grade its own work.
- **Established principles, not taste.** Findings cite Nielsen's heuristics, Norman, the
  cognitive walkthrough, Gestalt, Fitts and Hick, WCAG 2.2, Apple's HIG and Material 3.
  Severity follows Nielsen's frequency, impact and persistence, weighted by task criticality.
- **Calibrated.** An eval set with planted problems and clean screens measures what the
  critique catches and what it invents.

## What it builds on

| Part | Provided by |
|---|---|
| Rendering at phone sizes | [Playwright](https://playwright.dev) (Microsoft) |
| Accessibility rules | [axe-core](https://github.com/dequelabs/axe-core) (Deque) |
| Design-token file | [DESIGN.md](https://github.com/google-labs-code/design.md) format (Google Labs) |
| Design critique and audit stage | [Impeccable](https://github.com/pbakaus/impeccable) (Paul Bakaus), when installed |
| Reference screens from shipped apps | [Mobbin MCP](https://mobbin.com) (official, paid plans), when connected |
| Figma frames as input | [Figma MCP](https://help.figma.com/hc/en-us/articles/32132100833559) (official), when connected |
| Platform companion guidance | [`material-3`](https://github.com/hamen/material-3-skill), [designer-skills `ui-design`](https://github.com/Owl-Listener/designer-skills), [Expo skills](https://docs.expo.dev/skills/), when installed |
| **This repo** | Problem framing, mobile checks (targets, safe areas, text scaling, tokens), critic agents, principles library, merged report, evals |

Details and install commands: [skills/critique/references/companions.md](skills/critique/references/companions.md).

## Install

```text
/plugin marketplace add munderhaug/designcritique
/plugin install designcritique@designcritique
```

Then, once, from your app project:

```bash
bash ~/.claude/plugins/<path-to>/designcritique/scripts/setup.sh --with-impeccable
```

Node 20+ is required. The setup script installs dependencies, installs a browser if needed,
optionally installs Impeccable into the project, and lists which companions it found.
Connect Mobbin with `claude mcp add --transport http mobbin https://api.mobbin.com/mcp`.

## Use

```text
/designcritique:frame                      # write PRODUCT.md: problem, users, tasks
/designcritique:critique mockups.yaml      # full critique
/designcritique:critique mockups/onboarding.zip
/designcritique:critique https://claude.ai/artifact/…
```

Inputs: HTML files, PNG/JPG/WebP images, `.zip` exports, folders, Claude artifacts (pulled with
the artifact tools), Figma frames (via the Figma MCP), and canvases with several phone frames
(`phone_frame:`). See [templates/mockups.yaml](templates/mockups.yaml) and
[inputs.md](skills/critique/references/inputs.md).

Each run writes to `.designcritique/runs/<timestamp>/`: screenshots, `framing.md`,
`checks/findings.json`, `critique/*.json`, and the merged `findings.json`, `report.md` and `report.html`.

The scripts also run on their own:

```bash
node scripts/capture/capture.mjs --config mockups.yaml
node scripts/checks/run-checks.mjs --run <run>
node scripts/report/render-report.mjs --run <run>
```

## Evals

```bash
npm run eval          # captures the eval set, runs the checks, scores them
```

To score the critics, run `/designcritique:critique evals/mockups.yaml`, then
`npm run eval:score -- --run <run>`. See [evals/README.md](evals/README.md).

## Status and limits

Version 0.1: mockups and prototypes. Not yet:
- Running apps in simulators and emulators. Planned with MobileBuildMCP, Maestro MCP, Expo MCP
  and Android CLI, feeding the same checks, critics and report.
- Single-file React (`.jsx`) artifacts. Export them as HTML or images.
- Comparing runs over time.

Image inputs get critic judgement only; deterministic checks need HTML. Text scaling in
mockups is a proxy (root font size at 135%) for Dynamic Type and Android font scale.

## Layout

```
.claude-plugin/        plugin and marketplace manifests
commands/              /designcritique:critique, /designcritique:frame
skills/frame/          problem framing (PRODUCT.md)
skills/critique/       orchestration, inputs, severity, output format, companions, Mobbin
skills/principles/     principles library with stable IDs
agents/                ux-critic, ui-critic (read-only)
scripts/               capture, checks, report, evals, setup, companion detection
schemas/               critic output JSON Schema
templates/             PRODUCT.md, DESIGN.md, mockups.yaml
evals/                 calibration screens, expectations, fixtures
```

MIT licensed.
