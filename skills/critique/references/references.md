# Reference screens from shipped apps

A critique grounded in shipped apps is more convincing than one grounded in taste. Use one of
these sources, in this order. Never mix in screens from unnamed sources.

| Source | Access | Coverage | Notes |
|---|---|---|---|
| **Mobbin MCP** (official) | `mcp__Mobbin__search_flows`, `mcp__Mobbin__search_screens` | iOS and web: 620,000+ screens, 150,000+ flows | Paid plans. No Android library |
| **Refero MCP** (official) | `refero_search_screens`, `refero_search_flows`, `refero_get_screen`, `refero_get_flow` (clients may add a prefix) | Websites and iOS apps: 150,000+ screens, 6,000+ flows, plus styles (websites only) | Searching needs a paid plan. Add the connector alone (`claude mcp add --transport http refero https://api.refero.design/mcp`, then sign in from `/mcp`), not Refero's plugin, which also installs a design skill that claims priority over the critics. Use it when Mobbin isn't connected |
| **A local folder** | `references:` in mockups.yaml | Anything you've saved: Page Flows exports, your own screenshots, Figma exports | Page Flows covers Android too, but has no MCP; download and point at the files |
| **Baymard Institute** (research, not screens) | cited by hand, or via its UX-Query assistant if you have access | E-commerce UX guidelines from large-scale testing | For checkout, product and cart flows, cite the relevant guideline in a finding's evidence. No MCP |

## Check the source first

Being connected isn't the same as being usable: Mobbin's MCP connects on any account but only
searches on a paid plan, and so does Refero's live research. Before the critique, make one small call
per source and record the outcome in one line:

- **Mobbin:** `mcp__Mobbin__search_screens` with a neutral query (`"settings screen"`),
  `platform: "ios"`, `limit: 1`, `mode: "standard"` (fast), `output_destination: "doc"` and the
  run's `task_intent`.
- **Refero:** `refero_search_screens` with the same query and `platform: "ios"`. It takes no
  `limit`; read only the first result.

| Result | Report it as |
|---|---|
| Returns at least one screen | connected and working |
| Error or message about plan, subscription, upgrade, quota or billing (or HTTP 402/403), e.g. Mobbin's "Mobbin MCP requires a paid plan. Upgrade at …" | connected, needs a paid plan (or a sign-in) |
| No tools with that server's name, or a connection or auth error | not connected |
| Anything else | connected, probe failed: quote the first line of the error |

Say the result before the critique starts, use the first source that works in step 4, and put
the line at the top of `RUN_DIR/references.md` (write the file even when no source works).

## Steps (Mobbin or Refero)

1. For each key task in `PRODUCT.md` (start with the must-not-fail one), search for one journey
   (flows) or one screen type, plus the kind of app. No style words. Example: "food delivery app
   checkout".
   - Mobbin: `platform: "ios"`, `output_destination: "doc"`, the same `task_intent` on every call
     (for example "Critique a checkout flow design against shipped apps"), `limit` 3–5 flows or up to 8 screens.
   - Refero: `refero_search_flows` or `refero_search_screens` with `platform: "ios"` (`web` for a
     PWA), then `refero_get_flow` / `refero_get_screen` for the ones you keep; `page` for more.
     Search by what is on the screen or the task, not by style words. Don't use Refero's styles:
     they describe websites, not app screens.
   - There's no Android library in Mobbin or Refero. For Android apps, use iOS results for how
     the *task* is handled, never for platform conventions.
2. Look at the returned images and keep only genuinely comparable references (same task, similar audience).
3. Download each kept high-resolution `image_url` into `RUN_DIR/references/<task-slug>/<n>.webp`.
   Image URLs expire, so never link to them; cite the page link (`mobbin_url` or Refero's equivalent).
4. Write `RUN_DIR/references.md`:

   ```
   ## <Task name>
   - <App>: <screen or flow title>. <page link>. Local: references/<task-slug>/1.webp.
     Shows: <the pattern worth comparing, in one line>
   ```

## How critics use references

References show conventions and user expectations (`LAW-JAKOB`, `NN-H4`). They aren't a style
to copy. A mockup that differs from every reference isn't wrong by default; it needs a reason
that serves the user in PRODUCT.md. Cite references by app name and page link in `evidence`,
and never paste reference images into the report.

If no reference source is available, say so once in the reply. The critique still works
without one.
