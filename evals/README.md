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

- **feed**: Seeded flaws (checks): 40px icon buttons (< 48dp), nav items flush with the gesture area, image with no alt, single-line titles that clip, an off-token secondary grey that fails contrast in dark mode. Type is rem-based, so it scales; spacing and type stay on the token scales.
- **checkout**: Seeded flaws (critic): no way back from the checkout, placeholder-only form fields, a vague error message, the order total far from the pay button, and "Delete order" styled exactly like "Pay now". Tokens, contrast, targets and type scaling are all fine, so checks should stay quiet.
- **login**: Seeded flaws (checks): px-only type (no text scaling), 28px close button with no label in the status-bar area, 24px icon-only password toggle, low-contrast helper and legal text, 10px legal text, off-token orange and greys, off-scale spacing, a 420px social row that overflows, no dark mode.
- **welcome**: Seeded flaws (critic): generic purple-blue gradient hero, emoji used as feature icons, everything centred in identical cards, three competing primary buttons, made-up stats, a hamburger menu as primary navigation on iOS, and a web-style footer link row.
- **settings**, **trips**: clean. Token-compliant, accessible, dark mode, scalable type.

## Learning from decisions

When the person dismisses or re-rates a finding (`scripts/report/decide.mjs`), the decision is
kept in the project's `.designcritique/decisions.yaml` and applied to every later run. That fixes
one project. To fix the critics, look at `decide.mjs --list`: a principle that keeps being
dismissed or re-rated, or a decision marked `eval_candidate`, is a calibration problem. Turn it
into an eval case here (a neutral screen showing the pattern, with `max_major` or `must` in
`expected.json`), then change the principle text or the critic brief until the eval passes.

## Fixtures

- `fixtures/inputs.yaml`: smoke test for zip, phone-frame canvas and image inputs (not scored).
- `fixtures/sample-critique/anthropic-design.json`: a hand-written example of the critic output format, used to
  test the report. It is not a real critique.
