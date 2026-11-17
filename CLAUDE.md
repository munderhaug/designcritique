# Working on designcritique

- Scripts are Node ESM (`scripts/`), no build step. Run `npm install` once.
- After changing capture or checks, run `npm run eval`. It must stay at full recall with
  0 false positives on the clean screens.
- Eval screens must not hint at their flaws: neutral ids, titles and file names, no comments
  in the HTML. Document what is seeded in `evals/README.md`.
- Principle IDs are a contract: critics cite them and `evals/expected.json` matches on them.
  Don't rename an ID without updating both.
- Keep skills and agents short; put detail in `references/` files that load on demand.
