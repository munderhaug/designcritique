# designcritique

Human-centred design critique for mobile app mockups and prototypes (iOS, Android and PWAs), as a
Claude Code plugin. The judgement comes from proven tools: **Impeccable** and **Anthropic's
design plugin**. The evidence comes from **Playwright**, **axe-core** and two pinned anti-pattern
detectors, and the references from **Mobbin** or **Refero**.

It starts with the problem the app solves and who it's for, critiques the screens against that,
and ends by recommending what to build with, from a cited catalog.

```
1 Frame        2 References     3 Capture + checks         4 Independent critics      5 Report + gate
Impeccable     Mobbin / Refero  Playwright, axe-core,       Impeccable critique  ┐     report.html,
init + HCD     shipped apps     detectors, motion scan      Anthropic design     ┘     "To build this"
                                                            plugin methods             from catalog/stack.yaml
```

## What this repo adds

The tools it builds on, with versions, sources and what was considered and left out, are in
[companions.md](skills/critique/references/companions.md). On top of them, this repo adds:

- **Mobile capture.** Phone sizes per platform, light, dark and large text, the device's safe
  areas; HTML, images, zips, folders, Claude artifacts, Figma frames, phone-frame canvases,
  single-page-app states, served PWAs (`url:`) and app source (`source:`).
- **Deterministic checks** where no tool exists for mockups: 44pt/48dp targets, safe areas, text
  scaling and overlap, overflow, controls hidden under fixed bars, endless looping motion, dark
  mode, token drift against DESIGN.md, the design system itself, and deceptive consent patterns.
  One command runs them all ([checks.md](skills/critique/references/checks.md)).
- **Independent critics** on a model other than the one that made the mockups, each citing a
  principle ID from the [citation index](skills/principles/), so findings from different tools
  merge into one per problem.
- **A gate.** Every key task (T1, T2, … in PRODUCT.md) scored 0–10 by every critic that walked
  it, with no open finding at `fail_on` or worse. `gate.mjs` exits 2 for CI or a Stop hook.
- **Your decisions** (`.designcritique/decisions.yaml`), **run comparison** (fixed, new, still
  open) and **iterate** (fix, re-critique cold, keep the best round).
- **A build stack** chosen only from [`catalog/stack.yaml`](catalog/stack.yaml), where every
  entry names its maker, trust level and sources.
- **DESIGN.md starting points** from generic style families (`scripts/styles.mjs`), reduced to
  what carries over to a phone app.
- **Evals** with planted problems and clean screens, for the checks, the detectors, the token
  reader and the critics.

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
Anthropic's design and product-management plugins, then lists what it found. When an installer
can't run or reach its server (common in cloud sessions), it copies the skills from their GitHub
repositories instead. Add `--user` to install them for every project (`~/.claude/skills`).

For Claude Code on the web, put the companions in your cloud environment's setup script
(`--companions-only` skips what the plugin installs later):

```bash
git clone -q --depth 1 https://github.com/munderhaug/designcritique /tmp/dc-setup \
  && bash /tmp/dc-setup/scripts/setup.sh --companions-only --user \
  || echo "designcritique companions not installed"
rm -rf /tmp/dc-setup
```

Connect a reference source with `claude mcp add --transport http mobbin https://api.mobbin.com/mcp`
or `claude mcp add --transport http refero https://api.refero.design/mcp` (both paid for search;
sign in from `/mcp`). Add Refero's connector alone, not its plugin: the plugin also installs a
design skill that claims priority over the critics. Node 20+ is required.

## Two modes

- **`/designcritique:critique`**: screens and their states, the checks, two critics, report
  and gate.
- **`/designcritique:review`**: the whole product, several times the cost. It crawls the
  prototype (after Crawljax, Mesbah et al., 2012), replays the journeys, checks structure and
  consistency, and adds three lens reviewers (structure, scope, system). Their sources are in the
  [lens briefs](skills/review/references/lenses/). Structure and scope changes are always
  proposals for you to decide (`/designcritique:decide M2 accept`), never edits.

```text
/designcritique:frame                      # PRODUCT.md via Impeccable init + problem, key tasks, success criteria
/designcritique:critique mockups.yaml      # full critique
/designcritique:critique exports/prototype.zip
/designcritique:decide 4 dismiss "out of scope for v1"   # your verdict, kept across runs
/designcritique:iterate mockups.yaml --rounds 3          # fix and re-critique until the gate passes
/designcritique:review mockups.yaml                      # the whole product
```

Inputs are in [inputs.md](skills/critique/references/inputs.md) and
[templates/mockups.yaml](templates/mockups.yaml). Each run writes to
`.designcritique/runs/<timestamp>/`: screenshots, `framing.md`, `checks/`, `critique/*.json`,
`findings.json`, `report.md` and `report.html`.

```bash
node scripts/report/gate.mjs --run .designcritique/runs/<run>   # exit 2 with reasons when it fails
node scripts/report/recommend-stack.mjs --product PRODUCT.md     # build stack without a critique
node scripts/styles.mjs list                                     # DESIGN.md starting points
```

## Evals and tests

```bash
npm test               # unit tests
npm run eval           # screens: capture, checks, detectors, scoring (no model)
npm run eval:review    # whole product: crawl, journeys, structure, consistency; clean must pass every check
npm run eval:source    # detectors on SwiftUI, Compose, Android XML and React Native source
npm run eval:tokens    # token reader over open-design's 152 DESIGN.md files (fetched once, pinned)
npm run eval:noise     # how much the critics' judgement varies between runs
```

To score the critics, run `/designcritique:critique evals/mockups.yaml`, then
`npm run eval:score -- --run <run>`; for the lens reviewers, `/designcritique:review
evals/review/seeded.yaml`, then `npm run eval:lenses -- --run <run>`. Results and what each
eval screen plants are in [evals/README.md](evals/README.md).

## Status

For mockups and prototypes; the version is in `.claude-plugin/plugin.json`. Running apps:
simulator and device screenshots work as image inputs (critics only); next is driving
MobileBuildMCP, Maestro MCP, Expo MCP and Android CLI from capture. Large-text rendering is a
proxy for Dynamic Type and font scale. Not yet run end to end: external judges and `iterate` over
several rounds.

## Layout

```
catalog/               stack.yaml (build stack), styles.yaml (style starting points), vocabulary.yaml (words per language)
commands/              /designcritique:critique, :review, :frame, :iterate, :decide
skills/frame/          problem framing on top of Impeccable init
skills/critique/       orchestration; references/: checks, inputs, references, severity, output format, critic briefs, companions
skills/review/         whole-product review and its lens briefs (references/lenses/)
skills/iterate/        fix and re-critique in rounds until the gate passes
skills/principles/     citation index (IDs and primary sources)
agents/                design-reviewer; ia-, scope- and system-reviewer (all read-only)
hooks/                 validates critic JSON when it's saved
schemas/               critic output format (JSON Schema)
scripts/capture/       rendering at phone sizes
scripts/crawl/         state-flow crawler for the whole-product review
scripts/checks/        run-all and each check: screens, motion, detectors, structure, consistency
scripts/report/        report, gate, decisions, run comparison, iterate rounds, build stack
scripts/lib/           shared plumbing (merge, gate, decisions, tokens, …), unit-tested
scripts/eval/          eval runners and scorers
templates/             PRODUCT.md, DESIGN.md, mockups.yaml, CLAUDE design-system rule
tests/                 unit tests
evals/                 calibration screens, expectations, fixtures
```

MIT licensed. Impeccable (Apache 2.0) and Anthropic's plugins are installed as dependencies, not
copied into this repo.
