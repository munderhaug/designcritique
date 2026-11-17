---
description: Fix HTML mockups and re-critique them in rounds until they pass the gate or the round limit
argument-hint: "[mockups.yaml] [--rounds N]"
---

Use the designcritique **iterate** skill on: $ARGUMENTS

If no config is given, use `mockups.yaml` in the current project. `--rounds N` overrides
`iterate.max_rounds`.
