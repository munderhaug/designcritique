# The deterministic checks

`node PLUGIN_ROOT/scripts/checks/run-all.mjs --run <RUN_DIR>` runs every step below, in order,
and writes `checks/all.json`: everything found, for the critics to skip. Add `--review` for the
whole-product checks (the review skill does). A step that fails is named at the end; the others
still run.

| Step | Script | What it finds | Writes |
|---|---|---|---|
| Screen checks | `run-checks.mjs` | axe-core rules; touch targets (44pt / 48dp); text size, scaling, clipping and overlap at large text; overflow at 320px; safe areas; controls hidden under fixed bars; endless looping motion; dark appearance; token drift against DESIGN.md; deceptive consent patterns | `checks/findings.json` |
| Design system | (in `run-checks.mjs`) | DESIGN.md itself: text/surface token contrast, colour roles, a 4-based spacing scale, the eight essentials of the Smpl design-system guide (buttons and their states, forms, navigation, empty and error states, voice) | `checks/findings.json` |
| Motion | `motion.mjs scan` | transitions.dev scanner (Jakub Antalik), pinned and local, on HTML mockups. Its duration scale is a web scale, so off-scale timing stays P3; missing reduced-motion handling and overlays without transitions are P2 | `checks/motion.json` |
| Detectors | `detectors.mjs` | Impeccable's detector on each rendered mockup or served PWA at phone size and on HTML/CSS, unslopovich on app source (`source:`). Allowlisted rules only, each cited to a principle; a problem seen on the screen and in its code becomes one finding. Rules in [companions.md](companions.md#detectors) | `checks/detectors.json` |
| Structure (review) | `structure.mjs` | ways back, dead ends, depth, orphans, inconsistent navigation, broken journeys, loops that don't close, navigation order against `## Navigation`, out-of-scope features | `checks/structure.json`, `coverage.json`, `graph.json` |
| Consistency (review) | `consistency.mjs` | button variants, one icon with two meanings, glossary terms, number formats, figures that disagree across screens | `checks/consistency.json`, `consistency.json` |

Image inputs get no checks (critics only). Screens reached by steps, journeys or the crawler
aren't opened by the detectors, which load each page as it starts.
