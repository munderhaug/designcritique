# Reference screens from Mobbin

Critiques grounded in shipped apps are more convincing than critiques from taste. Use the
Mobbin MCP (`mcp__Mobbin__search_flows`, `mcp__Mobbin__search_screens`) when it's connected
and `mockups.yaml` lists no `references:` of its own.

## Steps

1. For each key task in `PRODUCT.md` (start with the must-not-fail one), search:
   - `search_flows` for multi-step tasks (for example "food delivery app checkout"), and
     `search_screens` for single screens (for example "banking app transfer confirmation screen").
   - Query: one journey or screen, plus the kind of app. No style words.
   - `platform: "ios"`. Mobbin has no Android library. For Android apps, use iOS results for how
     the *task* is handled, never for platform conventions.
   - `output_destination: "doc"` (the results go into a critique report). Keep `task_intent`
     the same across calls, for example "Critique a checkout flow design against shipped apps".
   - `limit`: 3 to 5 flows or up to 8 screens per task. Look at the returned images. Keep only
     references that are genuinely comparable (same task, similar audience).
2. Download each kept result's high-resolution `image_url` into
   `RUN_DIR/references/<task-slug>/<n>.webp`, because image URLs expire after 30 days. Never link to `image_url`.
3. Write `RUN_DIR/references.md`:

   ```
   ## <Task name>
   - <App>: <screen or flow title>. <mobbin_url>. Local: references/<task-slug>/1.webp.
     Shows: <the pattern worth comparing, in one line>
   ```

4. Give `references.md` to both critics (see critic-brief.md).

## How critics use references

- References are evidence about **conventions and user expectations** (`LAW-JAKOB`, `NN-H4`),
  not a style to copy. A mockup that differs from all references isn't wrong by default. It
  needs a reason that serves the user in PRODUCT.md.
- When citing one, name the app and give its `mobbin_url` in `evidence`, for example: "3 of 4
  reference checkouts (Uber Eats, …) keep the total on the pay button; this mockup puts it 600px above."
- Never paste Mobbin images into the report. Link to `mobbin_url`.

If Mobbin isn't connected, say so once in the reply. It's a paid plan; critiques still work
without it, using the principles library alone.
