# designcritique

A design sparring partner for mobile app mockups and prototypes (iOS, Android and PWAs), as a
Claude Code plugin. It is made for a designer: a second mind that understands design, reads
your screens cold, challenges your frame, critiques against it with evidence, and can be argued
with. The judgement comes from proven tools (**Impeccable**, **Anthropic's design and
product-management plugins**), the evidence from **Playwright**, **axe-core** and two pinned
anti-pattern detectors, and the references from **Mobbin** or **Refero** when connected.

It is one process, and the order matters:

```
1 Frame       2 Cold read        3 Challenge       4 Evidence            5 Critics            6 Report        7 Discuss
the problem   told nothing:      the frame:        capture at phone      independent, cold,   findings,       argue a finding
and who it    what do the        assumptions,      sizes, checks,        against the frame    questions,      with its critic;
is for        screens say        pre-mortem,       detectors                                  scores, gate    it holds, concedes
              this is?           alternatives                                                 (optional)      or revises
```

## What this repo adds

The tools it builds on, with versions, sources and what was considered and left out, are in
[companions.md](skills/critique/references/companions.md). On top of them, this repo adds:

- **Sparring.** A cold reading of the screens beside your frame; a devil's advocate on the
  frame before the screens are judged; questions for you that never count in a verdict;
  alternatives on findings; and a way to argue a finding with the critic that raised it
  ([sparring.md](skills/critique/references/sparring.md)).
- **Mobile capture.** Phone sizes per platform, light, dark and large text, the device's safe
  areas; HTML, images, zips, folders, Claude artifacts, Figma frames and prototype flows,
  phone-frame canvases, single-page-app states, served PWAs (`url:`), app source (`source:`)
  and, experimentally, native apps on a simulator or emulator.
- **Deterministic checks** where no tool exists for mockups: 44pt/48dp targets, safe areas, text
  scaling and overlap (also with a third more text, for other languages), overflow, controls
  hidden under fixed bars, fields that don't say what they collect, control order, reading ease,
  endless looping motion, dark mode, token drift against DESIGN.md, the design system itself,
  and deceptive consent patterns,
  measured on what a person can see, inside web components too
  ([checks.md](skills/critique/references/checks.md)).
- **Independent critics** on a model other than the one that made the mockups, each citing a
  principle ID from the [citation index](skills/principles/), so findings from different tools
  merge into one per problem. Their briefs are written by a script from the run, never by hand.
- **One command** for the deterministic part (`scripts/run.mjs`), which continues where it
  stopped, and an honest report: it says what wasn't examined, that it is an inspection and not
  a test with users, and fails its gate when evidence is missing.
- **A gate you can turn off.** Every key task (T1, T2, … in PRODUCT.md) scored 0–10 by every
  critic that walked it, with no open finding at `fail_on` or worse. `gate.mjs` exits 2 for CI
  or a Stop hook; `gate: off` leaves the conversation without the verdict.
- **Your decisions** (`.designcritique/decisions.yaml`), **run comparison** (fixed, new, still
  open) and **iterate** (a builder fixes, fresh critics re-judge cold, the best round is kept).
- **A build stack** for whoever builds it, chosen only from
  [`catalog/stack.yaml`](catalog/stack.yaml), where every entry names its maker, trust level and sources.
- **Evals** with planted problems and clean screens, for the checks, the detectors, the token
  reader, the critics and the sparring stages.

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

At the start of every session that uses the plugin, it lists what needs something from you
(companion skills to install, Mobbin or Refero, Figma, a running native app) and asks once which
of them to set up; nothing is connected, installed or asked for without your answer, and what you
skip it does without (`node scripts/connections.mjs` shows the same list).

Connect a reference source with `claude mcp add --transport http mobbin https://api.mobbin.com/mcp`
or `claude mcp add --transport http refero https://api.refero.design/mcp` (both paid for search;
sign in from `/mcp`). Add Refero's connector alone, not its plugin: the plugin also installs a
design skill that claims priority over the critics. Node 20+ is required.

## Using it

- **`/designcritique:critique`**: screens and their states: cold read, frame challenge, checks,
  two critics, report.
- **`/designcritique:review`**: the whole product, several times the cost. It crawls the
  prototype (after Crawljax, Mesbah et al., 2012) or reads a Figma prototype's flows, replays
  the journeys, checks structure and consistency, and adds three lens reviewers (structure,
  scope, system). Their sources are in the [lens briefs](skills/review/references/lenses/).
  Structure and scope changes are always proposals for you to decide, never edits.

```text
/designcritique:frame                      # PRODUCT.md via Impeccable init + problem, key tasks, success criteria
/designcritique:critique mockups.yaml      # full critique
/designcritique:critique exports/prototype.zip
/designcritique:discuss 4 "the total is in the sticky footer, it is never far from Pay"   # argue a finding with its critic
/designcritique:decide 4 dismiss "out of scope for v1"   # your verdict, kept across runs
/designcritique:decide C2 "we tested this with six people in March"   # answer a question the critics asked
/designcritique:iterate mockups.yaml --rounds 3          # fix and re-critique until the gate passes
/designcritique:review mockups.yaml                      # the whole product
```

Inputs are in [inputs.md](skills/critique/references/inputs.md) and
[templates/mockups.yaml](templates/mockups.yaml). Each run writes to
`.designcritique/runs/<timestamp>/`: screenshots, `framing.md`, `checks/`, `blind/`, `briefs/`,
`critique/*.json`, `findings.json`, `report.md` and `report.html`.

```bash
node scripts/run.mjs --config mockups.yaml [--review]            # capture, checks and reviewer briefs; continues with --run <run>
node scripts/run.mjs --run <run> --finish [--inline-thumbs]      # report and gate; --inline-thumbs: one report.html to send
node scripts/capture/capture.mjs --config mockups.yaml --out <run> --only <ids>   # redo some screens (or --journeys, --resume)
FIGMA_TOKEN=… node scripts/import/figma-flows.mjs --file <key> --images          # a Figma prototype's frames and flow graph
node scripts/report/gate.mjs --run <run>                         # exit 2 with reasons when it fails
node scripts/report/recommend-stack.mjs --product PRODUCT.md     # build stack without a critique
node scripts/styles.mjs list                                     # DESIGN.md starting points
```

## Evals and tests

```bash
npm test               # unit tests
npm run eval           # screens: capture, checks, detectors, scoring (no model)
npm run eval:review    # whole product: crawl, journeys, structure, consistency; clean and framework-built must pass every check
npm run eval:source    # detectors on SwiftUI, Compose, Android XML and React Native source
npm run eval:tokens    # token reader over open-design's 152 DESIGN.md files (fetched once, pinned)
npm run eval:noise     # how much the critics' judgement varies between runs
```

To score the critics, run `/designcritique:critique evals/mockups.yaml`, then
`npm run eval:score -- --run <run>`; for the lens reviewers, `/designcritique:review
evals/review/v1.yaml`, then `npm run eval:lenses -- --run <run>`; for the sparring stages, the
cold read and frame challenge on `evals/frame/f1.yaml`, then `npm run eval:frame -- --run <run>`. Results and what each
eval screen plants are in [evals/README.md](evals/README.md).

## Status

For mockups and prototypes; the version is in `.claude-plugin/plugin.json`. Experimental, and
not yet run against a live service or device from this repository: the Figma flow import (tested
on a recorded file shape) and native capture (adapter tested on recorded hierarchies; the driver
needs a simulator or emulator). Whole-product review and `iterate` work on the eval prototypes;
neither has a recorded end-to-end run on a large real product since the 0.7.2 fixes. Large-text
rendering is a proxy for Dynamic Type and font scale. External judges have not been run end to
end. Nothing here replaces testing with users, and the report says so.

## Layout

```
catalog/               stack.yaml (build stack), styles.yaml (style starting points), vocabulary.yaml (words per language)
commands/              /designcritique:decide (the other slash commands are the skills themselves)
skills/frame/          problem framing on top of Impeccable init
skills/critique/       orchestration; references/: checks, inputs, references, severity, output format, critic briefs, companions
skills/review/         whole-product review and its lens briefs (references/lenses/)
skills/discuss/        argue a finding with the critic that raised it
skills/iterate/        fix and re-critique in rounds until the gate passes
skills/principles/     citation index (IDs and primary sources)
agents/                cold-reader, frame-challenger, design-reviewer; ia-, scope- and system-reviewer (all read-only)
hooks/                 validates a critic JSON file edited by hand (save-critique.mjs validates the rest)
schemas/               critic output format (JSON Schema)
scripts/run.mjs        the deterministic stages in order, resumable
scripts/capture/       rendering at phone sizes; native.mjs for simulators and emulators (experimental)
scripts/import/        Figma prototype flows
scripts/crawl/         state-flow crawler for the whole-product review
scripts/checks/        run-all and each check: screens, motion, detectors, structure, consistency
scripts/report/        reviewer briefs, saving replies, report, gate, decisions, run comparison, iterate rounds, build stack
scripts/lib/           shared plumbing (merge, gate, decisions, tokens, …), unit-tested
scripts/eval/          eval runners and scorers
templates/             PRODUCT.md, DESIGN.md, mockups.yaml, CLAUDE design-system rule
tests/                 unit tests
evals/                 calibration screens, expectations, fixtures
```

MIT licensed. Impeccable (Apache 2.0) and Anthropic's plugins are installed as dependencies, not
copied into this repo.
