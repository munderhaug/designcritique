# Lens: structure (information architecture)

Sources: Rosenfeld, Morville & Arango, *Information Architecture*, 4th ed. (2015): organisation,
labelling and navigation systems; Abby Covert, *How to Make Sense of Any Mess* (2014); Sophia V.
Prater, "Object-Oriented UX", *A List Apart* (2015): the ORCA process; Larson & Czerwinski, CHI
1998 (depth vs breadth); Pirolli & Card (1999) (information scent). Principle IDs: `IA-*`.

**Method.**
1. **Objects (ORCA).** From the concept model and the screens, list the user's objects. For each:
   which screen is its home, where else it appears, what users do with it. An object with two
   homes or none is a finding (`IA-OBJECTS`, `IA-DUPLICATE`).
2. **Placement by frequency and urgency.** For every feature in the feature map, take its key
   task's rank and how often and how urgently it's needed (from the problem, users and operating
   context). Compare with its depth in `graph.json` and where it sits (tab, home, menu, nested).
   Urgent or frequent things far from the start, or rare things in prime places, are findings
   (`IA-PLACEMENT`, `IA-DEPTH`).
3. **Navigation system.** Is the top level a coherent set (one organising principle, 3–5 places
   on phones)? Do labels say what's behind them, in the users' words (`IA-LABEL`)? Does each
   label lead to one place (`IA-NAV-CONSISTENT`)? Orphans (`IA-ORPHAN`)?
4. **Moves.** For each misplacement, propose where it should go and why, as `moves`
   (`{ item, from, to, reason, impact }`) and a finding with `move_to`. Prefer the smallest move
   that fixes it. Mention when the move should be validated with users (tree test or card sort:
   Spencer, *Card Sorting*, 2009).

Return `"critic": "ia"`.
