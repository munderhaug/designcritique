# Evals

Calibration set for designcritique. Nine single screens from different apps with known
problems (or none), plus input-type fixtures.

```bash
npm run eval                      # capture + checks + detectors + score (deterministic, no model)
npm run eval:source               # detectors on app source only (SwiftUI, Compose, XML, React Native)
npm run eval:tokens               # token reader over open-design's 152 DESIGN.md files (pinned, fetched once)
```

To score the critics, run `/designcritique:critique evals/mockups.yaml` in Claude Code, then:

```bash
npm run eval:score -- --run <run-folder>
```

The critics (Impeccable and the design-reviewer) must find the seeded problems on `welcome` and
`checkout`, raise no P0/P1 on `settings`, `trips` and `choices`, and score the key tasks within
the bounds in `expected.json` → `$tasks` (low where a seeded flaw is on the task's path, high
where the screen is clean; every task scored). They are scored one by one and pooled.

**Nothing a reviewer reads may give the answer away.** Screen ids, titles, file and folder
names, the frame (`PRODUCT.md`), the tokens (`DESIGN.md`) and the configs are neutral; the HTML
carries no comments. What is seeded is written only here and in the `expected.json` files, which
no reviewer is given. For a recorded run, copy the eval projects to a folder whose path doesn't
say what they are, since reviewers are given paths.

## What is seeded

- **feed**: Seeded flaws (checks): 40px icon buttons (< 48dp), nav items flush with the gesture area, image with no alt, single-line titles that clip, a metadata line placed at a fixed offset under the title so the two overlap once text is enlarged, an off-token secondary grey that fails contrast in dark mode. Type is rem-based, so it scales; spacing and type stay on the token scales.
- **checkout**: Seeded flaws (critic): no way back from the checkout, placeholder-only form fields, a vague error message, the order total far from the pay button, and "Delete order" styled exactly like "Pay now". Tokens, contrast, targets and type scaling are all fine, so checks should stay quiet.
- **login**: Seeded flaws (checks): px-only type (no text scaling), 28px close button with no label in the status-bar area, 24px icon-only password toggle, low-contrast helper and legal text, 10px legal text, off-token orange and greys, off-scale spacing, a 420px social row that overflows, no dark mode.
- **welcome**: Seeded flaws (critic): generic purple-blue gradient hero, emoji used as feature icons, everything centred in identical cards, three competing primary buttons, made-up stats, a hamburger menu as primary navigation on iOS, and a web-style footer link row.
- **settings**, **trips**: clean. Token-compliant, accessible, dark mode, scalable type. Trips
  also shows a loading spinner (an endless animation marked as a progress bar), which must not
  count as looping motion.
- **activity**: Seeded flaws (checks): a long list under a fixed tab bar with no bottom padding,
  so its last button can never scroll clear of the bar, and a small dot pulsing without end next to
  the status line.
- **signup**: Seeded flaws (checks): marketing and data-sharing switches already on, a large filled
  "accept all" button against a small grey decline link, and a decline option worded to shame.
- **choices**: clean. The same choices, off by default, with equal-weight accept and reject.

The detectors run on the same screens. They must find, on **welcome**, the gradient palette
(rendered) and gradient (source), contrast on the gradient, the buzzwords and the made-up
numbers; on **feed**, the image without alt in the source (merged with axe's finding on the
render); on **checkout**, the vague error (its only allowed P0–P2 deterministic finding). On the
clean screens they must stay quiet.

## Design-system corpus (`npm run eval:tokens`)

Runs the token reader and the design-system checks over every DESIGN.md in open-design
(nexu-io, Apache-2.0) at a pinned commit (`scripts/lib/corpus.mjs`), fetched once into the
gitignored `evals/.cache/`; `--dir` points at a local checkout instead. It fails when the share
of systems where the reader finds colours, an action, surface and text role, a type scale and a
spacing scale drops below the thresholds in the script, or when the reader produces values no
design system holds (a font size under 6px, a negative step). Systems that describe spacing only
in words ("comfortable density mode") are fair misses. The corpus is eval data: nothing from it
is copied into this repo, and brand-named systems are never offered as starting points. Each
offered style is also converted into a phone-app starting point for iOS and Android, which must
keep its colours and surface role, carry exactly the platform's type scale, and have no website
layout left (grids, max widths, breakpoints).

At 2026-11-17: parsed 152/152, colours 152, action role 135, surface 150, text 148, type scale
131, spacing scale 123. Checks flagged: essentials 134, spacing not 4-based 72, roles 61,
token contrast 22.

## App source (`npm run eval:source`)

`evals/source/` holds one account screen in SwiftUI, Compose plus an Android XML layout, and
React Native, in two versions. `seeded/`: fixed text sizes (SwiftUI `.system(size:)`, XML `dp`,
React Native `allowFontScaling={false}`), the back gesture disabled (hidden back button,
`onBackPressed` override, `gestureEnabled: false`), content that ignores the safe area, a
navigation drawer, and a text field in a scroll view with no keyboard handling. `clean/`: the
same screens with text styles, `sp`, a scoped back handler, a background-only safe-area
extension, a navigation bar and keyboard avoidance. Every seeded flaw must be found in its file;
the clean version must have no P0–P2 finding.

## Whole-product review (`npm run eval:review`)

`evals/review/` holds one small single-page banking prototype in three versions, with the same
PRODUCT.md (journeys, concept model, scope, feature map, navigation) and content guide. The
folders are named neutrally because reviewers are given their paths:

- `v1/` has twelve structural and system flaws (below).
- `v2/` has none.
- `v3/` is `v2` built the way app frameworks build: the tab bar is a web component with its
  buttons in a shadow root, "Open an account" is a modal sheet over the page, page changes and
  the sheet are animated with the Web Animations API, and the app renders a moment after load.
  It must be as clean as `v2`, with every named screen reached and no tap or replay failing.
  This is the regression test for what broke on a real Ionic prototype (0.7.2).

The script crawls, captures, runs the checks, structure and consistency audits and scores
against `review/expected.json`: every seeded rule must fire on `v1`, and on `v2` and `v3` none of
the watched rules and no P0–P2 from any check.

Seeded: the must-not-fail "card lost" journey ends on a screen with no controls (dead end) and
no screen in it leads back home; it doesn't lead into ordering a new card; "Export statements"
is four taps deep; the monthly summary exists only as a separate page (orphan); "Overview" leads
to different places; the tab order differs from `## Navigation`; an out-of-scope feature is
present; the balance differs between two screens; a term the glossary says to avoid; one icon
with two meanings; three styles of primary button.

The checks already find every seeded flaw, so the reviewers are scored on what judgement adds
(`expected.json` → `lenses`): on `v1`, the IA reviewer cites a depth, orphan or navigation
principle and proposes a move; the scope reviewer cites `SCOPE-OUT` and proposes a cut, deferral
or move; the system reviewer cites a `CONS-*` principle; the design-reviewer and Impeccable judge
the must-not-fail "card lost" journey blocked or at risk. On `v2`, no reviewer raises a P0/P1
or proposes a cut or move. Run `/designcritique:review evals/review/v1.yaml` (and
`v2.yaml`), then `npm run eval:lenses -- --run <run>`. **Not yet run:** the reviewers have
no recorded score.

## Critic results

First end-to-end run of both critics on this set (2026-11-17). Each ran in a fresh agent that
had never seen the screens, the seeded flaws or the other critic's output, and the two ran on
different models. **Out of date:** this run covered the first six screens only; `signup`,
`choices` and `activity` came later, and so did key-task IDs, task coverage and Impeccable using
`severity.md` instead of its own scale. Re-run both critics before relying on these numbers.

| Critic | Setup | Recall on seeded screens | P0/P1 on clean screens | Findings |
|---|---|---|---|---|
| design-reviewer | Anthropic design plugin (knowledge-work-plugins `e91a134`) | 10/10 | 0 | 15 |
| Impeccable critique | Impeccable 4.9.2 (`pbakaus/impeccable` `d41d986`), native path | 10/10 | 0 | 15 |
| Both, merged | | 10/10 | 0 | 59 with the checks |

Key-task scores (0–10) from the two critics agreed within one point: checkout 3 / 3, log in
5 / 5, settings 9 / 9, feed 6 / 7, trips 9 / 9, welcome 4 / 4. Both kept the clean screens
at 9 and put checkout, the must-not-fail task, lowest. Impeccable labelled two tasks
`at-risk` while scoring them 3 and 4; the validator now warns when a verdict and score
disagree.

Not yet measured: whether the critics stay quiet on subtler clean screens, and run-to-run
variance. Re-run both critics after changing a brief, the agent or the principles index, and
update this table.

## Noise: the same screens judged twice (2026-11-17)

`npm run eval:noise` measures occasion noise (Kahneman, Sibony & Sunstein, *Noise*, 2021): the
critics judged the critic run above a second time, cold, with the same models, briefs and plugin
files (commit `1f7c259`), and the two judgements were compared.

| Critic | Task scores differ by | Same verdict | Findings in both runs | Same severity | P0/P1 reproduced |
|---|---|---|---|---|---|
| design-reviewer | 0.2 on average, at most 1 | 6 of 6 | 10 of 15 (67% overlap) | 90% | 3 of 4 (one moved P1 → P2) |
| Impeccable critique | 0.2 on average, at most 1 | 6 of 6 | 12 of 15 (67% overlap) | 100% | 5 of 5 |

Recall on the seeded screens was 10/10 in both runs, with no P0/P1 on the clean screens.

What this means:
- Task scores and verdicts are stable, so the gate's "lowest score" rule isn't failing runs at
  random.
- Serious findings mostly reproduce. The one that moved (placeholder-only labels at checkout)
  sits on the P1/P2 boundary that `severity.md` asks critics to settle by task criticality; a
  finding on a boundary can flip the `fail_on: P1` gate between runs.
- About a third of P2 and P3 findings come and go between runs. Treat a single run's minor
  findings as a sample, not a full list: a second run, or the other critic, finds more.

One repetition of two critics on six screens is a small sample. Re-run after changing a brief,
an agent or the principles index; critics now also record `subscores` before each task score,
which this measurement predates.

## Learning from decisions

When the person dismisses or re-rates a finding (`scripts/report/decide.mjs`), the decision is
kept in the project's `.designcritique/decisions.yaml` and applied to every later run. That fixes
one project. To fix the critics, look at `decide.mjs --list`: a principle that keeps being
dismissed or re-rated, or a decision marked `eval_candidate`, is a calibration problem. Turn it
into an eval case here (a neutral screen showing the pattern, with `max_major` or `must` in
`expected.json`), then change the principle text or the critic brief until the eval passes.

## Fixtures

- `fixtures/inputs.yaml`: smoke test for zip, phone-frame canvas and image inputs, and a single-page app (`fixtures/spa/`) captured in three states through `steps:`, one of them `appearance: dark-only`, plus a returning-user state seeded by a `setup:` script that reloads the page (not scored). All nine screens should capture without warnings.
- `fixtures/sample-critique/anthropic-design.json`: a hand-written example of the critic output format, used to
  test the report. It is not a real critique.
