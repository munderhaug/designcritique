# Working on designcritique

- Scripts are Node ESM (`scripts/`), no build step. Run `npm install` once.
- After changing capture or checks, run `npm run eval` and `npm test`. It must stay at full recall with
  0 false positives on the clean screens. After changing the crawler, journeys, structure or
  consistency checks, also run `npm run eval:review` (seeded flaws all found, none on clean).
- The plugin is generic: never build in one product's words, domain or language. Language words
  go in `catalog/vocabulary.yaml`; examples in principles and docs stay neutral.
- Eval screens must not hint at their flaws: neutral ids, titles and file names, no comments
  in the HTML. Document what is seeded in `evals/README.md`.
- Principle IDs are a contract: critics cite them and `evals/expected.json` matches on them.
  Don't rename an ID without updating both.
- Keep skills and agents short; put detail in `references/` files that load on demand.
- Judgement comes from proven sources. Wire in an existing companion skill when one covers the
  lens (Impeccable, Anthropic's design and product-management plugins). Where none does, a lens
  brief in `skills/review/references/lenses/` may define the lens, but every check in it must
  cite a primary source (author, work, year) and every finding must cite a principle ID.
  New ID families (`IA-*`, `SCOPE-*`, `JOURNEY-*`, `STATE-*`, `CONS-*`, `SPEC-*`) live in the
  principles index with their sources. Don't invent methods without a source.
- Prefer deterministic checks over another model reviewer when the question is measurable
  (graph structure, styles, terms, numbers). Reviewers judge what checks can't.
- The gate, decisions and scores are plumbing around the critics, not critique methods: keep
  them in `scripts/lib/` with unit tests.
- `catalog/stack.yaml` is the only source for build recommendations. Every entry needs `by`,
  `trust` and `sources`; update `verified` when you re-check entries.
