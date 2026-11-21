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

As in the critique skill, step 0, plus the scope lens's companion: `setup.sh --install-companions`
also installs Anthropic's product-management skills. Probe Mobbin and Refero up front.

## 1. Frame the whole product

Run the **frame** skill with the product sections: Journeys, Concept model, Scope, Feature map
and (if the spec fixes it) Navigation, derived from the project's documents. Then make sure
`mockups.yaml` has `journeys:` (one per journey in PRODUCT.md, as the taps a user makes) and a
`crawl:` block (`start:` the app's page, or a list when some screens can't be tapped to from one
start; `avoid:` any extra controls not to press). Add `content:`
(the content guide, for the glossary) and `language:` if the pages don't set `<html lang>`.

## 2. See everything (deterministic)

```bash
node PLUGIN_ROOT/scripts/crawl/crawl.mjs --config mockups.yaml --out <RUN_DIR>
node PLUGIN_ROOT/scripts/capture/capture.mjs --config mockups.yaml --out <RUN_DIR> --inventory <RUN_DIR>/inventory.json
node PLUGIN_ROOT/scripts/checks/run-all.mjs --run <RUN_DIR> --review
```

Read the crawl summary: if it hit the state limit, or a journey broke, fix `mockups.yaml` (steps,
`avoid:`, `max_states`) and run again before any reviewer sees the result. Look at
`coverage.json`: features not captured are "not covered", and the reply asks for captures.
`notCovered` lists crawl states the tooling couldn't explore (a failed tap or replay, a limit):
they are kept out of the dead-end and way-back checks and the gate.

Capture writes the manifest as it goes. To redo some screens or journeys, or finish a capture a
time limit stopped, run capture again into the same `<RUN_DIR>` with `--only <ids>` (mockup,
screen, journey or crawl state ids), `--journeys <ids>` or `--resume`: the new captures replace
the old ones with the same id and the rest is kept. A full capture of a large prototype takes
long; run it in the background, or in parts with `--only`.

## 3. Independent reviewers, in parallel

None sees another's output or how the prototype was made. Brief each with the run folder,
`framing.md`, `coverage.json`, `graph.json`, `inventory.json`, `checks/all.json` (every
deterministic finding: don't repeat), `consistency.json`, the decisions file, the principles index, one
standard light screenshot per screen family (from `coverage.json` → `states[].screens`), and each
journey's screenshots in step order. Details: [lenses/common.md](references/lenses/common.md).

| Reviewer | Lens brief | Saves to |
|---|---|---|
| design-reviewer (+ journeys) | critic-brief.md plus [lenses/journeys.md](references/lenses/journeys.md) | `critique/anthropic-design.json` |
| Impeccable critique (+ emotional journey) | critic-brief.md plus lenses/journeys.md | `critique/impeccable.json` |
| `ia-reviewer` | [lenses/ia.md](references/lenses/ia.md) | `critique/ia.json` |
| `scope-reviewer` | [lenses/scope.md](references/lenses/scope.md), with the product-management skill paths | `critique/scope.json` |
| `system-reviewer` | [lenses/system.md](references/lenses/system.md), with design-system and Impeccable harden paths | `critique/system.json` |

Run each on `critics.judge_model` when set (or a model other than the one that built the
prototype), and add `critics.external` judges as in the critique skill. The design-reviewer and
Impeccable score the key tasks and journeys; the lens reviewers don't. Other design skills in the
session are never given to a reviewer. Save every reply with `save-critique.mjs` (critique skill,
step 5): it extracts, stamps `--coverage` from the brief, validates and saves in one step, and
reads the agent's transcript when a long reply was cut off.

## 4. Report and gate

```bash
node PLUGIN_ROOT/scripts/report/render-report.mjs --run <RUN_DIR>
node PLUGIN_ROOT/scripts/report/gate.mjs --run <RUN_DIR>
```

Add `--inline-thumbs` to put every screenshot into `report.html` as a small image, for one file
to send or open on a phone. Gate reasons are labelled `[check]`, `[critic]`, `[check + critic]`
or `[capture]`. The report adds coverage and the state matrix, the IA map, a journey map per journey with a
verdict per step, features against the problem, ranked cut/add/move proposals and the
consistency inventory. The gate adds: no dead end, missing way back or broken step on a
must-not-fail journey; journeys at `gate.journey_target_score`; at least
`gate.min_feature_coverage` of the feature map captured.

## 5. Reply

The gate result; the three proposals with the most impact (ids, so the person can decide with
`/designcritique:decide M2 accept`); the must-not-fail journey's verdict; the worst structural
findings; what wasn't covered and how to capture it; which reviewers ran. Point to
`report.html`. Never move, cut or add anything yourself: structure and scope are the person's
decisions.
