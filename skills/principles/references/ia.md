# Information architecture

Sources: Rosenfeld, Morville & Arango, *Information Architecture: For the Web and Beyond*, 4th ed.
(O'Reilly, 2015), its organisation, labelling, navigation and search systems; Abby Covert, *How to
Make Sense of Any Mess* (2014), one meaning per word and one home per thing; Sophia V. Prater
(then Voychehovski), "Object-Oriented UX", *A List Apart* (2015), the ORCA process (objects,
relationships, calls to action, attributes); Larson & Czerwinski, "Web page design: implications of
memory, structure and scent for information retrieval", CHI 1998 (depth vs breadth); Pirolli & Card,
"Information foraging", *Psychological Review* (1999) (information scent). Placement is judged
against PRODUCT.md: the ranked key tasks and how often and how urgently each is needed.

| ID | Principle | Look for |
|---|---|---|
| `IA-PLACEMENT` | Each feature sits where its users look for it, closer the more often and urgently it's needed | An urgent action (help, pay, undo) buried in a menu; a rare setting on the home screen |
| `IA-DEPTH` | Frequent and urgent tasks are few taps from the start; depth costs more than breadth on phones | A key task 4+ taps deep; long chains of single-choice screens |
| `IA-OBJECTS` | Screens are organised around the user's objects, and each object has a home of its own (ORCA) | An object with no screen of its own; screens that mirror the database, not the user's model (two places for one thing is `IA-DUPLICATE`) |
| `IA-DUPLICATE` | One thing in one place, unless a shortcut is deliberate and labelled the same | Two screens with the same title and job; the same setting in two menus |
| `IA-ORPHAN` | Everything is reachable through the navigation | A screen reachable only from a notification or a hand-made state; a feature with no entry point |
| `IA-NAV-CONSISTENT` | The same control leads to the same place from everywhere | "Overview" opening different screens from different places; a tab whose destination changes with where you came from |
| `IA-LABEL` | Labels use the users' words and say what's behind them (information scent) | Internal jargon; vague labels ("More", "Misc", "Other") (two terms for one thing is `CONS-TERM`) |
