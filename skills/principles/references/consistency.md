# System consistency

Sources: Nielsen's consistency and standards (`NN-H4`); Abby Covert, *How to Make Sense of Any
Mess* (2014) (one word, one meaning); Torrey Podmajersky, *Strategic Writing for UX* (O'Reilly,
2019) (a voice chart and a word list kept consistent across an interface); Brad Frost, *Atomic
Design* (2016) (components defined once and reused by role); the Unicode CLDR locale data for
number, date and currency formats. Methods are wired in from Anthropic's `design-system` skill
when installed. Terms are checked against the glossary in the content guide (`content:` in
mockups.yaml).

| ID | Principle | Look for |
|---|---|---|
| `CONS-COMPONENT` | Elements with the same role use the same component and style | Three styles of primary button; cards for the same object styled differently |
| `CONS-ICON` | One icon, one meaning, everywhere | A star icon for both "favourite" and "rating"; two icons for one action |
| `CONS-TERM` | One term per concept, as the glossary defines it | "Basket" and "Cart" for the same thing; a term the content guide says to avoid |
| `CONS-FORMAT` | Numbers, dates, units and currency follow one format for the locale | "1500 kr", "kr 1 500" and "1 500,-" in one app |
| `CONS-PATTERN` | One problem is solved one way | Some lists swipe to delete, others need an edit mode |
