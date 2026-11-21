# AI tells in generated mobile UI

Sources: the anti-pattern rules of Impeccable's detector (Paul Bakaus, 2025–26) and of
unslopovich (erkamyaman), which the detector stage runs; see companions.md for the rules
imported. A tell is an observation about sameness, not a principle: it never stands alone, and
the principle it breaks (second column) is what the finding rests on.

These patterns make screens look generic and template-made. Each is a finding only when it
also hurts the user or the brand. Pair each one with the principle it breaks.

| ID | Tell | Usually breaks |
|---|---|---|
| `TELL-GRADIENT` | Purple-to-blue (or similar) gradient hero or buttons with no brand reason | `VIS-COLOR`, `NN-H8` |
| `TELL-EMOJI` | Emoji used as feature or navigation icons | `IOS-ICONS` / `AND-ICONS`, `NN-H4` |
| `TELL-CARDS` | Everything centred in identical rounded cards with soft shadows; cards inside cards | `GESTALT-REGION`, `VIS-HIERARCHY` |
| `TELL-SAMENESS` | One radius, one shadow, one weight everywhere, so nothing leads | `VIS-HIERARCHY` |
| `TELL-FAKE-PROOF` | Made-up metrics ("10x faster", "99% happy users"), placeholder testimonials | `NN-H2`, trust |
| `TELL-WEB-IDIOMS` | Website patterns on a phone: footer link rows, hamburger as primary navigation, hover-dependent affordances, top navigation link rows | `LAW-JAKOB`, `IOS-NAV-TABBAR` / `AND-NAV-BAR` |
| `TELL-EYEBROW` | Uppercase eyebrow labels over every heading; display serif plus italic accent word in every title | `NN-H8`, `VIS-TYPE` |
| `TELL-BUZZWORDS` | Generic copy ("Supercharge your workflow", "all-in-one platform") that names no user or task | `NN-H2`, `TASK-WALK-Q1` |
| `TELL-CTA-STACK` | Several equally loud calls to action | `LAW-HICK`, `VIS-ISOLATION` |
