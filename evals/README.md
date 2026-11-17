# Evals

Calibration set for designcritique. Six single screens from different apps with known
problems (or none), plus input-type fixtures.

```bash
npm run eval                      # capture + checks + score (deterministic, no model)
```

To score the critics, run `/designcritique:critique evals/mockups.yaml` in Claude Code, then:

```bash
npm run eval:score -- --run evals/.runs/<run-folder>
```

The critics (Impeccable and the design-reviewer) together must find the seeded problems on `welcome` and `checkout` and raise no P0/P1 on
`settings` and `trips`. Expectations are in `expected.json`. Screen names are neutral and the
mockup HTML carries no hints, so the critics judge them cold. Don't add hints.

## What is seeded

- **feed**: Seeded flaws (checks): 40px icon buttons (< 48dp), nav items flush with the gesture area, image with no alt, single-line titles that clip, a metadata line placed at a fixed offset under the title so the two overlap once text is enlarged, an off-token secondary grey that fails contrast in dark mode. Type is rem-based, so it scales; spacing and type stay on the token scales.
- **checkout**: Seeded flaws (critic): no way back from the checkout, placeholder-only form fields, a vague error message, the order total far from the pay button, and "Delete order" styled exactly like "Pay now". Tokens, contrast, targets and type scaling are all fine, so checks should stay quiet.
- **login**: Seeded flaws (checks): px-only type (no text scaling), 28px close button with no label in the status-bar area, 24px icon-only password toggle, low-contrast helper and legal text, 10px legal text, off-token orange and greys, off-scale spacing, a 420px social row that overflows, no dark mode.
- **welcome**: Seeded flaws (critic): generic purple-blue gradient hero, emoji used as feature icons, everything centred in identical cards, three competing primary buttons, made-up stats, a hamburger menu as primary navigation on iOS, and a web-style footer link row.
- **settings**, **trips**: clean. Token-compliant, accessible, dark mode, scalable type.
- **signup**: Seeded flaws (checks): marketing and data-sharing switches already on, a large filled
  "accept all" button against a small grey decline link, and a decline option worded to shame.
- **choices**: clean. The same choices, off by default, with equal-weight accept and reject.

## Whole-product review (`npm run eval:review`)

`evals/review/` holds one small single-page banking prototype in two versions, with the same
PRODUCT.md (journeys, concept model, scope, feature map, navigation) and content guide.
`seeded/` has twelve structural and system flaws; `clean/` has none. The script crawls, captures,
runs the checks, structure and consistency audits and scores against `review/expected.json`:
every seeded rule must fire, and none of the watched rules may fire on the clean version.

Seeded: the must-not-fail "card lost" journey ends on a screen with no controls (dead end) and
no screen in it leads back home; it doesn't lead into ordering a new card; "Export statements"
is four taps deep; the monthly summary exists only as a separate page (orphan); "Overview" leads
to different places; the tab order differs from `## Navigation`; an out-of-scope feature is
present; the balance differs between two screens; a term the glossary says to avoid; one icon
with two meanings; three styles of primary button.

The lens reviewers (ia, scope, system) aren't scored yet: run `/designcritique:review
evals/review/seeded.yaml` and compare with the seeded list above.

## Critic results

First end-to-end run of both critics on this set (2026-11-17). Each ran in a fresh agent that
had never seen the screens, the seeded flaws or the other critic's output, and the two ran on
different models.

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
