# Interface copy (UX writing)

Sources: Torrey Podmajersky, *Strategic Writing for UX* (O'Reilly, 2019): interface text is
purposeful, concise, conversational and clear, in a voice set for the product; Kinneret Yifrah,
*Microcopy: The Complete Guide* (Nemala, 2017): labels, errors and empty states; Jakob Nielsen,
"Error Message Guidelines" (Nielsen Norman Group, 2001); Janice Redish, *Letting Go of the
Words* (2nd ed., Morgan Kaufmann, 2012): plain language, key message first. Cite these when
applying Anthropic's ux-copy method. One term per meaning is `CONS-TERM`; empty states as a state
are `STATE-EMPTY`; form labels for accessibility are `WCAG-3.3.2`.

| ID | Principle | Look for |
|---|---|---|
| `COPY-CLEAR` | Words the user knows, one meaning each; no internal or technical terms (Podmajersky: clear; Redish) | Jargon, system names, abbreviations the user must decode |
| `COPY-CONCISE` | As few words as carry the meaning, the key word first (Podmajersky: concise; Redish) | Long intros before the point; repeated headings and body text |
| `COPY-PURPOSEFUL` | Every piece of text helps the user decide or act (Podmajersky: purposeful) | Filler, marketing lines on task screens, text nobody needs at that step |
| `COPY-TONE` | Tone fits the user's situation and the product's voice, and never blames (Podmajersky: conversational; voice chart) | Jokes in an emergency or an error, cold system language, mixed voices |
| `COPY-ACTION-LABEL` | Buttons and links say what will happen, as a verb and its object (Yifrah; Podmajersky) | "OK", "Submit", "Click here"; two buttons that both say "Continue" |
| `COPY-ERROR` | Errors say what happened and how to fix it, in human words, near the problem (Nielsen 2001; Yifrah) | Codes, "Invalid input", blame, an error far from its field |

Reading ease is measured by a check: LIX (C. H. Björnsson, *Läsbarhet*, Liber, 1968), sentence
length plus the share of long words. It reports under `COPY-CLEAR` when running text scores
above 55 ("difficult" on Björnsson's scale); it says nothing about short labels.
