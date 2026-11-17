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
| Accessibility rules | axe-core (Deque) | Mobile checks with no existing tool for mockups: 44pt/48dp targets, safe areas, text scaling, overflow, text overlapping text at large sizes (thresholds after AutoDesign's DOM audit), token drift against DESIGN.md |
| Critique 1 | Impeccable `critique`: Nielsen scoring, cognitive load, personas, native iOS/Android references | Runs it in a fresh agent and converts the output |
| Critique 2 | Anthropic design plugin: `design-critique`, `accessibility-review`, `ux-copy` | The read-only `design-reviewer` agent applies them to the screenshots, adds the cognitive walkthrough (Wharton et al.) of each key task |
| Platform guidance | Material 3 skill (hamen), Expo skills, when installed | Routing the right guidance to the reviewer |
| Motion | transitions-agent (Jakub Antalik, transitions.dev): deterministic local scan | Importing its findings for HTML mockups, mobile-aware severities |
| Design-system checks | The eight essentials of the Smpl design-system guide; DESIGN.md format | Token contrast, colour roles, 4-based spacing, coverage of the essentials |
| Merged report | | De-duplication, severity (Nielsen's factors, weighted by task criticality), annotated HTML, **since last run** (fixed / new / still open) |
| Critic output validation | ajv (JSON Schema) | A plugin hook that rejects invalid critic JSON when it's saved inside a run (exit 2) |
| Independent judging | | The reviewer runs on a model you choose (`critics.judge_model`), ideally not the one that made the mockups; extra judges on other tools (`critics.external`, e.g. Codex) use the same brief and format |
| Scores and gate | | Each critic scores every key task 0–10 against fixed anchors; the gate fails on open findings at `fail_on` or a key task below `target_score` (lowest critic counts). `gate.mjs` exits 2 for CI or a Stop hook |
| Your decisions | | `.designcritique/decisions.yaml`: dismissed or re-rated findings stay that way across runs, critics see them, and `decide.mjs --list` shows where the critics are miscalibrated |
| Taste | | Optional `taste:` references you chose; critics score closeness separately from usability |
| Iterate | AutoDesign (Yaxin Luo): keep the best candidate, not the last | `/designcritique:iterate`: a builder fixes HTML mockups, fresh critics re-judge, until the gate passes or the round limit; every round is snapshotted and the loop ends on its best round (`rounds.mjs`) |
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

When the critique ran on HTML mockups, the report adds **While you prototype in HTML**
(transitions.dev skills and scanner). Items the catalog watches but doesn't recommend yet,
like libraries.dev, are listed separately. For the build itself, `templates/CLAUDE-design-system.md`
is a CLAUDE.md rule that keeps agents on your design system.

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
Anthropic's design plugin, then lists what it found. When an installer can't run or can't reach
its server (common in cloud sessions), it copies the skills from the companions' GitHub
repositories instead. Add `--user` to install them for every project (`~/.claude/skills`).

For Claude Code on the web, put the companions in your cloud environment's setup script so every
session starts with them (`--companions-only` skips everything the plugin itself installs later):

```bash
git clone -q --depth 1 https://github.com/munderhaug/designcritique /tmp/dc-setup \
  && bash /tmp/dc-setup/scripts/setup.sh --companions-only --user \
  || echo "designcritique companions not installed"
rm -rf /tmp/dc-setup
``` Connect a reference source with
`claude mcp add --transport http mobbin https://api.mobbin.com/mcp` (paid) or Refero
(`https://api.refero.design/mcp`, freemium). Node 20+ is required.

## Use

```text
/designcritique:frame                      # PRODUCT.md via Impeccable init + problem, key tasks, success criteria
/designcritique:critique mockups.yaml      # full critique
/designcritique:critique exports/prototype.zip
/designcritique:critique https://claude.ai/artifact/…
/designcritique:decide 4 dismiss "out of scope for v1"   # your verdict, kept across runs
/designcritique:iterate mockups.yaml --rounds 3          # fix and re-critique until the gate passes
```

Inputs: HTML, PNG/JPG/WebP, `.zip` exports, folders, Claude artifacts, Figma frames, canvases
with several phone frames (`phone_frame:`), and screenshots from a simulator or device. See [templates/mockups.yaml](templates/mockups.yaml).
Each run writes to `.designcritique/runs/<timestamp>/`: screenshots, `framing.md`,
`checks/findings.json`, `critique/*.json`, `findings.json`, `report.md`, `report.html`.

## Compare runs

Run the critique again after changing the design. The report compares with the previous run
of the same mockups and lists what was fixed, what is new and what is still open.
`node scripts/report/compare-runs.mjs --run <run> [--base <run>]` does it by hand.

## Gate in CI or a hook

```bash
node scripts/report/gate.mjs --run .designcritique/runs/<run>   # exit 2 with reasons when it fails
```

`gate:` in mockups.yaml sets the bar (`fail_on: P1`, `target_score: 8` by default);
`--fail-on` and `--target` override it.

## Evals and tests

```bash
npm run eval     # capture, checks and scoring on the eval set (no model)
npm test         # unit tests: design-system checks, comparison, validation
```

To score the critics, run `/designcritique:critique evals/mockups.yaml`, then
`npm run eval:score -- --run <run>`. See [evals/README.md](evals/README.md).

## Status

Version 0.2, for mockups and prototypes. Tested: capture, checks (all planted problems found,
no false alarms on clean screens), design-system checks, input types, report, run comparison,
validation hook, gate, decisions and build-stack recommendations; the motion import against a
sample scan. Critic results on the eval set are in [evals/README.md](evals/README.md).
**Not yet run end to end:** the reference step, a live transitions-agent scan, external judges and
`iterate` over several rounds.

Running apps: simulator and device screenshots work as image inputs today. Next: driving
MobileBuildMCP, Maestro MCP, Expo MCP and Android CLI from capture.
Not supported: single-file `.jsx` artifacts (export as HTML or images). Image inputs get critics
only; deterministic checks need HTML. Large-text rendering is a proxy for Dynamic Type and font scale.

## Layout

```
catalog/stack.yaml     cited build-stack catalog
commands/              /designcritique:critique, :frame, :iterate, :decide
skills/frame/          problem framing on top of Impeccable init
skills/critique/       orchestration, inputs, references, severity, output format, companions
skills/iterate/        fix and re-critique in rounds until the gate passes
skills/principles/     citation index (IDs and primary sources)
agents/                design-reviewer (read-only, Anthropic design-plugin methods)
hooks/                 validates critic JSON when it's saved
scripts/               capture, checks, report, stack recommender, evals, setup, companion detection
templates/             PRODUCT.md (Impeccable schema + HCD), DESIGN.md, mockups.yaml, CLAUDE design-system rule
tests/                 unit tests
evals/                 calibration screens, expectations, fixtures
```

MIT licensed. Impeccable (Apache 2.0) and Anthropic's design plugin are installed as
dependencies, not copied into this repo.
