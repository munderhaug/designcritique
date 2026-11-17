# Usability heuristics and interaction principles

## Nielsen's 10 usability heuristics

Source: Jakob Nielsen, "10 Usability Heuristics for User Interface Design" (1994; wording
updated 2020, Nielsen Norman Group). Derived from factor analysis of 249 usability problems.

| ID | Heuristic | On a phone screen, look for |
|---|---|---|
| `NN-H1` | Visibility of system status | Loading, progress, saved/sent confirmation, selected state, current tab, step x of n |
| `NN-H2` | Match between system and the real world | User's words, not internal jargon; familiar units, dates, currency; natural order |
| `NN-H3` | User control and freedom | Back / close / cancel on every pushed or modal screen; undo after destructive actions |
| `NN-H4` | Consistency and standards | Same thing looks and behaves the same; platform conventions (see `LAW-JAKOB`) |
| `NN-H5` | Error prevention | Constraints, sensible defaults, confirmation or undo for destructive actions, destructive actions visually distinct |
| `NN-H6` | Recognition rather than recall | Key information visible where the decision is made (e.g. total next to Pay); visible labels, not memory |
| `NN-H7` | Flexibility and efficiency of use | Shortcuts for frequent tasks, autofill, saved details, sensible keyboard types |
| `NN-H8` | Aesthetic and minimalist design | Every element earns its place; no decoration competing with the task |
| `NN-H9` | Help users recognize, diagnose, and recover from errors | Plain-language errors next to the cause, saying what happened and how to fix it |
| `NN-H10` | Help and documentation | Contextual help where tasks are unfamiliar; not a substitute for clarity |

## Norman's principles

Source: Don Norman, *The Design of Everyday Things*, revised edition (2013).

| ID | Principle | On a phone screen, look for |
|---|---|---|
| `NORMAN-SIGNIFIER` | Affordances and signifiers | Tappable things look tappable; non-tappable things don't (flat text that is secretly a button, cards that look like buttons) |
| `NORMAN-MAPPING` | Mapping | Controls sit next to and relate clearly to what they affect |
| `NORMAN-FEEDBACK` | Feedback | Every action gets an immediate, visible response (pressed, loading, done) |
| `NORMAN-CONSTRAINT` | Constraints | The design makes wrong actions hard (disabled until valid, pickers instead of free text) |
| `NORMAN-MODEL` | Conceptual model | The screens give the user a coherent picture of how the app works and where they are |
| `NORMAN-GULFS` | Gulfs of execution and evaluation | Can the user work out what to do (execution) and tell whether it worked (evaluation)? |

## Severity: Nielsen's factors

Rate severity by three factors (Nielsen, "Severity Ratings for Usability Problems", 1994):
**frequency** (how often users hit it), **impact** (how hard it is to overcome) and
**persistence** (once known, does it keep bothering them). Weigh by how critical the
affected task is in `PRODUCT.md`. See the critique skill's `severity.md` for the P0–P3 mapping.
