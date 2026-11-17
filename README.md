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
| Rendering | Playwright (Microsoft) | Phone sizes per platform; light, dark and large-text variants; zip, folder, artifact and phone-frame inputs; single-page app states reached by `steps:` and a `setup:` script |
| Accessibility rules | axe-core (Deque) | Mobile checks with no existing tool for mockups: 44pt/48dp targets, safe areas, text scaling, overflow, text overlapping text at large sizes (thresholds after AutoDesign's DOM audit), controls that stay hidden under fixed bars however far you scroll (WCAG 2.4.11), decorative animation that loops without end (WCAG 2.2.2), token drift against DESIGN.md |
| Critique 1 | Impeccable `critique`: Nielsen scoring, cognitive load, personas, native iOS/Android references | Runs it in a fresh agent and converts the output |
| Critique 2 | Anthropic design plugin: `design-critique`, `accessibility-review`, `ux-copy` | The read-only `design-reviewer` agent applies them to the screenshots, adds the cognitive walkthrough (Wharton et al.) of each key task |
| Platform guidance | Material 3 skill (hamen), Expo skills, when installed | Routing the right guidance to the reviewer |
| Anti-pattern detectors, two angles | Impeccable's detector (rendered page at phone size, and HTML/CSS) and unslopovich (app source: SwiftUI, Compose, Android XML, React Native, Flutter, web), both pinned in package.json | An allowlist of their rules mapped to principle IDs, `url:` for served PWAs and `source:` for app code, and one finding when the screen and its code show the same problem |
| Motion | transitions-agent (Jakub Antalik, transitions.dev): deterministic local scan, pinned in package.json | Running it and importing its findings for HTML mockups, mobile-aware severities |
| Design-system checks | The eight essentials of the Smpl design-system guide; DESIGN.md format | Token contrast, colour roles, 4-based spacing, coverage of the essentials. The token reader is measured on open-design's 152 DESIGN.md files (`npm run eval:tokens`) |
| Style starting points | open-design (nexu-io, Apache-2.0), pinned | `scripts/styles.mjs`: 52 generic style families as a first DESIGN.md for a phone app. They were made for websites, so only their visual language is kept (colour, font families, spacing, radii, voice); type sizes come from the platform, and layout, navigation, components and motion from the HIG or Material 3. With attribution; never a system modelled on a named company |
| Merged report | | One finding per problem: the same problem from both critics (or a check and a critic) is merged and marked as higher confidence; a check failing on many screens is reported once with the screen list. Severity (Nielsen's factors, weighted by task criticality), annotated HTML, **since last run** (fixed / new / still open) |
| Deceptive patterns | Gray et al. (CHI 2018), Mathur et al. (CSCW 2019), Brignull (2023), CJEU *Planet49* (2019), EDPB Guidelines 03/2022 | `ETHICS-*` principles; checks for pre-ticked consent, lopsided accept/decline choices and confirmshaming on every HTML screen, in the prototype's language; reviewers look for obstruction, sneaking, false urgency, forced actions and nagging |
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

## Two modes

- **`/designcritique:critique`**: fast. Screens and their states, two critics, deterministic
  checks, report and gate.
- **`/designcritique:review`**: the whole product, several times the cost. It crawls the
  prototype, replays journeys, and adds reviewers for journeys, structure (IA), concept and
  scope, and system consistency.

### What the review adds

| Part | Grounded in | This repo adds |
|---|---|---|
| Crawl | Crawljax's state-flow crawling (Mesbah et al., 2012); DroidBot-style state IDs (Li et al., 2017) | `scripts/crawl/`: taps every control, records each screen, sheet and state from Playwright's accessibility snapshot, with guardrails; `inventory.json` with each state's path |
| Journeys | Shostack's service blueprints (1984), Patton's story maps (2014), the cognitive walkthrough | `journeys:` in mockups.yaml, replayed tap by tap and captured; broken steps, dead ends, ways back and unclosed loops computed from the graph |
| Problem frame | Jobs to be done, OOUX (Prater 2015), release slices | Journeys, Concept model, Scope, Feature map and Navigation in PRODUCT.md, derived from the project's documents |
| Structure (IA) | Rosenfeld, Morville & Arango (2015), Covert (2014), OOUX | `ia-reviewer`; depth, orphans and navigation consistency computed; an IA map; "move X from A to B" proposals |
| Concept and scope | Christensen (2016), Ulwick (2005), Torres (2021) | `scope-reviewer` using Anthropic's product-management skills; feature × problem matrix; cut/add proposals |
| System | NN-H4, Covert, Podmajersky (2019), Frost (2016), Hurff's UI stack (2016) | `system-reviewer` with Anthropic's design-system and Impeccable's harden; a deterministic audit of button styles, icons with two meanings, glossary terms, number formats and figures that disagree; a state matrix |
| Coverage | | What wasn't captured is reported as not covered, not missing; the gate needs a minimum share of the feature map |
| Language | | Words the crawler and checks need (destructive controls, back labels, state words) come from `catalog/vocabulary.yaml` (en, de, fr, es, nb, sv, da) by the pages' language, extendable per project |

Structure and scope changes are always proposals for you to decide (`/designcritique:decide M2
accept`), never edits.

## Use

```text
/designcritique:frame                      # PRODUCT.md via Impeccable init + problem, key tasks, success criteria
/designcritique:critique mockups.yaml      # full critique
/designcritique:critique exports/prototype.zip
/designcritique:critique https://claude.ai/artifact/…
/designcritique:decide 4 dismiss "out of scope for v1"   # your verdict, kept across runs
/designcritique:iterate mockups.yaml --rounds 3          # fix and re-critique until the gate passes
/designcritique:review mockups.yaml                      # the whole product: crawl, journeys, IA, scope, system
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
npm run eval:noise -- prepare --run <run> --out <copy>   # then run the critics on the copy, and:
npm run eval:noise -- compare --a <run> --b <copy>       # how much the critics' judgement varies between runs
npm run eval:review   # whole-product review: crawl, journeys, structure and consistency on a seeded and a clean prototype
npm test         # unit tests
```

To score the critics, run `/designcritique:critique evals/mockups.yaml`, then
`npm run eval:score -- --run <run>`. See [evals/README.md](evals/README.md).

## Status

Version 0.5, for mockups and prototypes. Tested: capture, checks (all planted problems found,
no false alarms on clean screens), design-system checks, input types, report, run comparison,
validation hook, gate, decisions and build-stack recommendations; the motion import against a
sample scan. Critic results on the eval set are in [evals/README.md](evals/README.md).
**Not yet run end to end:** the reference step, a live transitions-agent scan, external judges and
`iterate` over several rounds.

Running apps: simulator and device screenshots work as image inputs today. Next: driving
MobileBuildMCP, Maestro MCP, Expo MCP and Android CLI from capture.
PWAs: point `url:` at the served app. Native apps: list the code under `source:` so the detectors
read it alongside the screenshots. Not supported: single-file `.jsx` artifacts as rendered
screens (export as HTML or images). Image inputs get critics
only; deterministic checks need HTML. Large-text rendering is a proxy for Dynamic Type and font scale.

## Layout

```
catalog/stack.yaml     cited build-stack catalog
catalog/styles.yaml    style families offered as DESIGN.md starting points
catalog/vocabulary.yaml  words per language (consent, states, controls not to press)
commands/              /designcritique:critique, :review, :frame, :iterate, :decide
skills/frame/          problem framing on top of Impeccable init
skills/critique/       orchestration, inputs, references, severity, output format, companions
skills/iterate/        fix and re-critique in rounds until the gate passes
skills/review/         whole-product review and its lens briefs (references/lenses/)
skills/principles/     citation index (IDs and primary sources)
agents/                design-reviewer; ia-, scope- and system-reviewer (all read-only)
hooks/                 validates critic JSON when it's saved
scripts/               capture, checks, report, stack recommender, evals, setup, companion detection
templates/             PRODUCT.md (Impeccable schema + HCD), DESIGN.md, mockups.yaml, CLAUDE design-system rule
tests/                 unit tests
evals/                 calibration screens, expectations, fixtures
```

MIT licensed. Impeccable (Apache 2.0) and Anthropic's design plugin are installed as
dependencies, not copied into this repo.
