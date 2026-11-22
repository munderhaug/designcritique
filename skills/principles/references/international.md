# Other languages and scripts

Sources: W3C Internationalization, "Text size in translation" (Richard Ishida, 2007): text
translated from English commonly grows, most for short strings; W3C, "Structural markup and
right-to-left text in HTML"; Apple, Human Interface Guidelines, "Right to left"; Material
Design, "Bidirectionality"; Unicode CLDR for number, date and currency formats (`CONS-FORMAT`).

| ID | Principle | Look for |
|---|---|---|
| `INTL-EXPANSION` | Layouts survive longer text: labels, buttons and tabs have room to grow (W3C i18n) | Fixed-width buttons and tabs; single-line labels that clip or overlap once the text is a third longer |
| `INTL-RTL` | In right-to-left languages the layout mirrors, and what has a direction of its own does not (HIG; Material) | Back arrows, progress and lists that keep a left-to-right order; mirrored clocks, media controls or numbers |
