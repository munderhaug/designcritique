# Cognitive walkthrough

Source: Wharton, Rieman, Lewis and Polson, "The Cognitive Walkthrough Method: A Practitioner's
Guide" (1994), in Nielsen and Mack (eds.), *Usability Inspection Methods*. The streamlined
variant is from Spencer, "The Streamlined Cognitive Walkthrough Method" (CHI 2000).

A walkthrough asks whether a *first-time* user of the kind described in `PRODUCT.md` can
complete a *key task* by exploring, step by step through the screens.

## Method

1. Take one key task from `PRODUCT.md` and the user who does it.
2. Write the correct action sequence through the provided screens. If a step needs a screen
   that does not exist, note it as a gap (`TASK-FIT`), not a defect in the existing screens.
3. For every action, answer the four questions. Each "no" is a finding; cite its question ID.

| ID | Question | A "no" usually means |
|---|---|---|
| `TASK-WALK-Q1` | Will the user try to achieve the right effect? | The user's goal doesn't map to what the screen offers; wrong mental model |
| `TASK-WALK-Q2` | Will the user notice that the correct action is available? | Action hidden, below the fold, low contrast, in a menu, looks non-interactive |
| `TASK-WALK-Q3` | Will the user associate the correct action with the effect they want? | Vague or jargon label, ambiguous icon, competing look-alike actions |
| `TASK-WALK-Q4` | If the correct action is performed, will the user see that progress is being made? | No feedback, no confirmation, unclear next state |

## Task fit

`TASK-FIT`: the screen set as a whole does not serve the problem in `PRODUCT.md`. It's missing
a step the task needs, centres on something the user does not need, or optimises for a different
user than the one described. This is often the most important finding. State it once per task, at
the top, not per screen.

## Verdict per task

- **supported**: every step passes all four questions.
- **at risk**: steps pass, but with friction that some users will fail on (P2 issues).
- **blocked**: at least one step fails in a way that stops the described user (a P0 or P1 issue).
- **not covered**: the mockups don't include the screens needed to walk the task.
