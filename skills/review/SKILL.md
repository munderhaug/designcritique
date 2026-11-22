---
name: review
description: Whole-product review of a mobile app prototype - crawls every screen and state, replays the journeys, maps the information architecture, audits consistency and states, and runs independent lens reviewers (journeys, structure/IA, concept and scope, system consistency and spec) alongside the screen critics. Ends with an IA map, journey maps, a feature × problem matrix, ranked cut/add/move proposals and a gate. Slower and costlier than /designcritique:critique; use it when asked to review the whole product, its structure, flows or scope.
argument-hint: "[mockups.yaml]"
---

# Review the whole product

The screen critique (the **critique** skill) judges screens. This skill judges the product:
where things belong, whether journeys hold together, whether every feature earns its place and
whether the system is consistent. It costs several times a critique: say so before starting.

`PLUGIN_ROOT` is two folders up from this skill's base directory.

Invoked as `/designcritique:review`, the input is: $ARGUMENTS

With no input, use `mockups.yaml` in the current project. Before starting, also say which
reviewers will run.

## 0. Setup

As in the critique skill, step 0: ask first what to connect, once, before anything else. For a
whole-product review it matters most whether a Figma prototype's flows or a running native app
should be read; `connections.mjs` says what each needs.

## 1. Frame the whole product

Run the **frame** skill with the product sections: Journeys, Concept model, Scope, Feature map
and (if the spec fixes it) Navigation, derived from the project's documents. Then make sure
`mockups.yaml` has `journeys:` (one per journey in PRODUCT.md, as the taps a user makes) and a
`crawl:` block (`start:` the app's page, or a list when some screens can't be tapped to from one
start; `avoid:` any extra controls not to press). Add `content:`
(the content guide, for the glossary) and `language:` if the pages don't set `<html lang>`.

## 2. See everything (one command)

```bash
node PLUGIN_ROOT/scripts/run.mjs --config mockups.yaml --review     # prints RUN_DIR=...
```

It crawls the prototype, captures every state and journey, runs every check (structure and
consistency included) and writes the reviewers' briefs and their order
(`RUN_DIR/briefs/plan.json`). A large prototype takes long: run it in the background. If a time
limit or a crash stops it, `run.mjs --run <RUN_DIR>` continues where it stopped; to redo some
screens or journeys, `capture.mjs --out <RUN_DIR> --only <ids>` (or `--journeys <ids>`), then
`run.mjs --run <RUN_DIR> --from checks`. After an edit, `--base <the earlier run>` keeps its
close-look findings for screens that did not change (critique `references/critic-brief.md`).

Read the crawl summary: if it hit the state limit, or a journey broke, fix `mockups.yaml` (steps,
`avoid:`, `max_states`, a second `crawl.start`) and run again before any reviewer sees the
result. Look at `coverage.json`: features not captured are "not covered", and the reply asks for
captures. `notCovered` lists crawl states the tooling couldn't explore (a failed tap or replay,
a limit): they are kept out of the dead-end and way-back checks and fail no gate by themselves.

## 3. Reviewers, stage by stage

As in the critique skill, step 4: follow `briefs/plan.json`, give each reviewer its brief
unchanged, save each reply with its `save` command.

1. **Cold read**, of one screen per screen family.
2. **Frame challenge**, then stop and talk with the designer about the cold reading and the
   questions before the product is judged against the frame.
3. **Independent reviewers**, in parallel. The design-reviewer and Impeccable judge one screen
   per screen family and every journey step by step, and score the key tasks and journeys. The
   lens reviewers judge the whole: `ia` ([lenses/ia.md](references/lenses/ia.md)), `scope`
   ([lenses/scope.md](references/lenses/scope.md)), `system`
   ([lenses/system.md](references/lenses/system.md)); what they all read and return is in
   [lenses/common.md](references/lenses/common.md).

## 4. Report and gate

```bash
node PLUGIN_ROOT/scripts/run.mjs --run <RUN_DIR> --finish [--inline-thumbs]
```

Beyond the critique's report it adds coverage and the state matrix, the IA map, a journey map
per journey with a verdict per step, features against the problem, ranked cut/add/move
proposals and the consistency inventory. The gate adds: no dead end, missing way back or broken
step on a must-not-fail journey; journeys at `gate.journey_target_score`; at least
`gate.min_feature_coverage` of the feature map captured. Gate reasons say where they come from:
`[check]`, `[critic]`, `[check + critic]`, `[capture]` or `[tooling]`.

## 5. Reply

The gate result; the three proposals with the most impact (ids, so the person can decide with
`/designcritique:decide M2 accept`); the must-not-fail journey's verdict; the worst structural
findings; what wasn't covered and how to capture it; which reviewers ran. Point to
`report.html`. Never move, cut or add anything yourself: structure and scope are the designer's
decisions. Stay in the conversation afterwards: findings are argued with the **discuss** skill,
proposals decided with `/designcritique:decide`.
