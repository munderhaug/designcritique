# Severity

Based on Nielsen's severity ratings ("Severity Ratings for Usability Problems", 1994). Judge
**frequency** (how many users hit it, how often), **impact** (how hard it is to overcome) and
**persistence** (does it keep hurting after users learn it). Then weigh by the **criticality**
of the affected task in `PRODUCT.md`.

| Level | Nielsen | Means | Typical examples |
|---|---|---|---|
| **P0** | 4, catastrophe | Stops the primary user completing a must-not-fail task, or shuts out a group of users | No way to submit; key action unreachable with a screen reader; content unreadable in dark mode |
| **P1** | 3, major | Many users fail, make errors or need help on a key task; important to fix before release | Destructive action styled as primary; vague payment error; text that can't scale; tiny primary targets |
| **P2** | 2, minor | Slows users down or causes recoverable errors; fix soon | Inconsistent components; secondary targets slightly small; off-token colours |
| **P3** | 1, cosmetic | Polish; fix when there's time | Off-scale spacing; minor alignment |

Rules:
- The same problem on a must-not-fail task goes up one level; on an out-of-scope task, down one.
- When unsure between two levels, pick the lower and say why in `impact`. When unsure whether
  it is a problem at all, it is a challenge (a question for the designer), not a low finding.
- A task that completes wrongly and can't be undone (the wrong amount, the wrong person, data
  exposed) counts as stopping it: P0 on a must-not-fail task.
- Accessibility failures that shut a group of users out of a must-not-fail task are P0; out of
  any key task, never below P1.
- Don't inflate. A report with ten P1s helps no one. If everything seems major, re-rank.
