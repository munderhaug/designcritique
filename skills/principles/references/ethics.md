# Deceptive patterns and ethics

A design that works against its user's own interest is a finding even when it converts. The test
is Thaler & Sunstein's: would users endorse the design "as judged by themselves" (*Nudge*, final
ed., 2021)?

Sources: Gray, Kou, Battles, Hoggatt & Toombs, "The Dark (Patterns) Side of UX Design", CHI 2018
(nagging, obstruction, sneaking, interface interference, forced action); Mathur, Acar, Friedman,
Lucherini, Mayer, Chetty & Narayanan, "Dark Patterns at Scale: Findings from a Crawl of 11K
Shopping Websites", *Proc. ACM HCI* (CSCW) 2019 (sneaking, urgency, misdirection, social proof,
scarcity, obstruction, forced action); Harry Brignull, *Deceptive Patterns* (2023) and
deceptive.design; Court of Justice of the EU, *Planet49* (C-673/17, 2019): a pre-ticked box is
not valid consent; European Data Protection Board, Guidelines 03/2022 on deceptive design
patterns; EU Digital Services Act (Regulation 2022/2065), Art. 25.

| ID | Principle | Look for |
|---|---|---|
| `ETHICS-PRESELECTED` | Consent, marketing, data sharing and tracking start off; the user turns them on | Pre-ticked newsletter or "share with partners" boxes; tracking switched on by default |
| `ETHICS-ASYMMETRY` | Accepting and declining a choice about the user's data, money or attention carry the same visual weight | A big filled "Accept all" against a small grey "Manage options" link |
| `ETHICS-CONFIRMSHAMING` | Declining is worded neutrally | "No thanks, I don't like saving money" |
| `ETHICS-OBSTRUCTION` | Leaving, cancelling or opting out is no harder than joining | Sign-up in one tap, cancellation only by phone or buried five screens deep |
| `ETHICS-SNEAKING` | Costs, renewals and consequences are shown before the user commits | Fees revealed at the last step; items added to the basket; a trial that renews silently |
| `ETHICS-PRESSURE` | Urgency, scarcity and social proof are real | Countdown timers that reset; "only 2 left" on unlimited stock; invented activity |
| `ETHICS-FORCED` | The user can do what they came for without unrelated actions | Forced sign-up, contact upload or app download to continue |
| `ETHICS-NAGGING` | A refused request isn't repeated at every turn | Permission or upsell prompts on every launch after "not now" |

The first three are checked automatically on HTML screens (`CHK-PRESELECTED-CONSENT`,
`CHK-ASYMMETRIC-CHOICE`, `CHK-CONFIRMSHAMING`); the rest need a reviewer, usually across a
journey. Severity: a pattern that costs the user money or valid consent is never below P1.
