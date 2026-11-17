# designcritique

Human-centred design critique for mobile app mockups and prototypes, as a Claude Code plugin,
built on proven tools: **Impeccable** and **Anthropic's design plugin** for the judgement,
**Playwright** and **axe-core** for the evidence, **Mobbin** or **Refero** for references
from shipped apps.

It starts with the problem the app solves and who it's for, then critiques the screens against
that, and ends by recommending what to build with, from a cited catalog.

```
1 Frame        2 References     3 Capture + checks      4 Two critiques            5 Report + build stack
Impeccable     Mobbin / Refero  Playwright, axe-core,    Impeccable critique  ┐     report.html,
init + HCD     shipped apps     mobile checks            Anthropic design     ┘     "To build this"
                                                         plugin methods             from catalog/stack.yaml
```

## What comes from where

| Part | Provided by | This repo adds |
|---|---|---|
| Problem framing (PRODUCT.md) | Impeccable `init` (Paul Bakaus) | Problem, ranked Key Tasks and Success Criteria (ISO 9241-210/-11, jobs to be done), evidence tags |
| References | Mobbin MCP or Refero MCP (official) | How to pick and cite comparable screens per key task |
| Rendering | Playwright (Microsoft) | Phone sizes per platform; light, dark and large-text variants; zip, folder, artifact and phone-frame inputs |
| Accessibility rules | axe-core (Deque) | Mobile checks with no existing tool for mockups: 44pt/48dp targets, safe areas, text scaling, overflow, token drift against DESIGN.md |
| Critique 1 | Impeccable `critique`: Nielsen scoring, cognitive load, personas, native iOS/Android references | Runs it in a fresh agent and converts the output |
| Critique 2 | Anthropic design plugin: `design-critique`, `accessibility-review`, `ux-copy` | The read-only `design-reviewer` agent applies them to the screenshots, adds the cognitive walkthrough (Wharton et al.) of each key task |
| Platform guidance | Material 3 skill (hamen), designer-skills `ui-design`, Expo skills, when installed | Routing the right guidance to the reviewer |
| Merged report | | De-duplication, severity (Nielsen's factors, weighted by task criticality), annotated HTML |
| Build stack | `catalog/stack.yaml`: 26 entries, each with maker, trust level and sources | Picks per platform and stack, ranked by what the findings show |
| Calibration | | Eval screens with planted problems and clean screens, and a scorer |

## Where "To build this, start with X" comes from

Every critique report ends with **To build this**:
1. design system and components
2. tokens
3. platform skills
4. design-quality skills
5. design inputs and references
6. device checks

The recommender (`scripts/lib/stack.mjs`) picks **only** from
[`catalog/stack.yaml`](catalog/stack.yaml). It never invents tools:
- Each entry records who makes it, whether it's official, practitioner or community, its install
  command and the sources it was checked against, plus a `verified` date.
- Picks are filtered by `## Platform` and `## Stack` in PRODUCT.md, and ranked by the categories
  of findings in the run (accessibility, tokens, platform and so on).
- If the stack is undecided, each step lists the options per stack.

The catalog was compiled from the platform owners' docs (Apple, Google, Expo, Flutter, Figma,
Anthropic) and established practitioners (Antoine van der Lee, Paul Hudson, Callstack, Paul
Bakaus). Re-verify it when the date is more than about three months old.

```bash
node scripts/report/recommend-stack.mjs --product PRODUCT.md   # recommendations without a critique
```

## Install

```text
/plugin marketplace add munderhaug/designcritique
/plugin install designcritique@designcritique
```

Then, once, in your app project:

```bash
bash <plugin-dir>/scripts/setup.sh --install-companions
```

This installs script dependencies and a browser if needed, Impeccable into the project, and
Anthropic's design plugin, then lists what it found. Connect a reference source with
`claude mcp add --transport http mobbin https://api.mobbin.com/mcp` (paid) or Refero
(`https://api.refero.design/mcp`, freemium). Node 20+ is required.

## Use

```text
/designcritique:frame                      # PRODUCT.md via Impeccable init + problem, key tasks, success criteria
/designcritique:critique mockups.yaml      # full critique
/designcritique:critique exports/prototype.zip
/designcritique:critique https://claude.ai/artifact/…
```

Inputs: HTML, PNG/JPG/WebP, `.zip` exports, folders, Claude artifacts, Figma frames, and canvases
with several phone frames (`phone_frame:`). See [templates/mockups.yaml](templates/mockups.yaml).
Each run writes to `.designcritique/runs/<timestamp>/`: screenshots, `framing.md`,
`checks/findings.json`, `critique/*.json`, `findings.json`, `report.md`, `report.html`.

## Evals

```bash
npm run eval     # capture, checks and scoring on the eval set (no model)
```

To score the critics, run `/designcritique:critique evals/mockups.yaml`, then
`npm run eval:score -- --run <run>`. See [evals/README.md](evals/README.md).

## Status

Version 0.1, for mockups and prototypes. Tested: capture, checks (all planted problems found,
no false alarms on clean screens), input types, report and build-stack recommendations.
**Not yet run end to end:** the two critics and the reference step. They depend on Impeccable,
the Anthropic design plugin and Mobbin or Refero, which need a Claude Code session with them installed.

Next: running apps through MobileBuildMCP, Maestro MCP, Expo MCP and Android CLI.
Not supported: single-file `.jsx` artifacts (export as HTML or images). Image inputs get critics
only; deterministic checks need HTML. Large-text rendering is a proxy for Dynamic Type and font scale.

## Layout

```
catalog/stack.yaml     cited build-stack catalog
commands/              /designcritique:critique, /designcritique:frame
skills/frame/          problem framing on top of Impeccable init
skills/critique/       orchestration, inputs, references, severity, output format, companions
skills/principles/     citation index (IDs and primary sources)
agents/                design-reviewer (read-only, Anthropic design-plugin methods)
scripts/               capture, checks, report, stack recommender, evals, setup, companion detection
templates/             PRODUCT.md (Impeccable schema + HCD), DESIGN.md, mockups.yaml
evals/                 calibration screens, expectations, fixtures
```

MIT licensed. Impeccable (Apache 2.0) and Anthropic's design plugin are installed as
dependencies, not copied into this repo.
