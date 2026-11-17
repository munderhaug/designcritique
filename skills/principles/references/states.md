# Logic and states

Sources: Scott Hurff, *Designing Products People Love* (O'Reilly, 2016), the "UI stack": every
screen has an ideal, empty, error, partial and loading state; offline and first-run are
additions here, not Hurff's. Nielsen's `NN-H1` (status) and `NN-H9` (errors) and Norman's
conceptual model (`NORMAN-MODEL`) explain why they matter. Methods are wired in from
Impeccable's `harden` when installed.

| ID | Principle | Look for |
|---|---|---|
| `STATE-EMPTY` | Empty states explain what will appear and how to start | A blank list; "No data" with no next step |
| `STATE-ERROR` | Error states say what happened, keep what was entered, and offer a way on | Generic "Something went wrong"; lost input |
| `STATE-LOADING` | Waiting shows progress and keeps context | Blank screens while loading; spinners for long waits with no estimate |
| `STATE-PARTIAL` | Partly filled screens look intentional and point to what's missing | Half-empty layouts that look broken; no prompt to complete |
| `STATE-OFFLINE` | Without a connection the app says what still works (addition to Hurff) | Silent failures offline; urgent features that need the network |
| `STATE-FIRST-RUN` | The first run shows value and how to start (addition to Hurff) | An empty home on first launch; onboarding that blocks the urgent path |
| `STATE-NUMBERS-AGREE` | The same figure shows the same value everywhere it appears | A balance of 1,240 on one screen and 1,204 on another for the same account |
