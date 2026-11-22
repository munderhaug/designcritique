# What designcritique builds on

The judgement and the product record come from proven tools. This repo provides capture,
mobile checks for mockups, orchestration, the merged report, evals and the build-stack
catalog. Run `node PLUGIN_ROOT/scripts/companions.mjs --project <project>` to see what's installed.

## Core: needed for a full critique

| Tool | By | Role | Install |
|---|---|---|---|
| Impeccable | Paul Bakaus | `init` writes PRODUCT.md (frame skill); `critique` is one of the two critics; its detector runs as a check; `harden` is the system lens's method for states (empty, loading, error, offline, extreme data) | `setup.sh --install-companions` (the version pinned in package.json, `--no-hooks`) |
| Anthropic design plugin | Anthropic (official) | `design-critique`, `accessibility-review`, `ux-copy` are the design-reviewer's methods; `design-system` is the system lens's method; `user-research` for real research | `claude plugin marketplace add anthropics/knowledge-work-plugins` then `claude plugin install design@knowledge-work-plugins` |
| Anthropic product-management plugin | Anthropic (official) | `product-brainstorming`'s assumption testing is the frame challenger's method (every critique); `product-brainstorming` and `write-spec` are the scope lens's methods (review mode) | `claude plugin install product-management@knowledge-work-plugins` |
| Playwright | Microsoft | Renders HTML mockups at phone sizes, light, dark and large text | npm dependency |
| axe-core | Deque | Accessibility rules engine | npm dependency |
| DESIGN.md format | Google Labs | Token file the token checks read | template in `templates/` |

`bash scripts/setup.sh --install-companions` installs Impeccable into the project and the
Anthropic design and product-management plugins for the user, falling back to copying their skills from GitHub when an
installer can't run or reach its server. `--user` installs into `~/.claude/skills` for every
project; `--companions-only` does only that, for cloud environment setup scripts.

## Motion and design systems

| Tool or source | By | Role |
|---|---|---|
| transitions-agent | Jakub Antalik (transitions.dev), MIT | Deterministic motion scan of HTML mockups; imported as findings by `scripts/checks/motion.mjs` |
| transitions-dev, transitions-polish skills | Jakub Antalik | Motion recipes and token rules when fixing motion in HTML prototypes (web only; native apps follow platform motion) |
| Smpl design-system guide | Andreas Melvær, Smpl | The "eight essentials" behind the design-system checks, and the CLAUDE.md rule in `templates/CLAUDE-design-system.md` |

## Detectors

Run by `scripts/checks/detectors.mjs`, pinned in package.json, local, telemetry and update checks
off. Only the rules below are imported, each mapped to a principle ID (`scripts/lib/detectors.mjs`).
Rules a designcritique check already measures (contrast on solid fills, text size, overlap,
overflow, tokens, looping motion) and taste-only rules without a cited principle are left out.

| Engine | By, licence | Surface | Rules imported |
|---|---|---|---|
| Impeccable detect (pinned in package.json) | Paul Bakaus, Apache-2.0 | rendered (browser at phone size) and HTML/CSS/JSX source | AI colour palette and gradient text (`TELL-GRADIENT`), nested cards (`TELL-CARDS`), eyebrow labels (`TELL-EYEBROW`), marketing buzzwords (`TELL-BUZZWORDS`, English), skipped heading level (`WCAG-1.3.1`), low contrast on gradients (`WCAG-1.4.3`) |
| unslopovich (pinned in package.json) | erkamyaman, MIT | source: SwiftUI, Compose, Android XML, React Native, Flutter, web | fixed text size (`IOS-TYPE`/`AND-TYPE`, `WCAG-1.4.4`), back gesture disabled (`IOS-NAV-STACK`/`AND-APPBAR`), safe area ignored and keyboard covering fields (`IOS-LAYOUT`/`AND-LAYOUT`), drawer navigation and hover-only (`TELL-WEB-IDIOMS`), zoom disabled, image without alt, clickable div, focus removed (`WCAG-1.4.4`, `1.1.1`, `4.1.2`, `2.4.7`), decorative pulse (`WCAG-2.2.2`), vague errors (`NN-H9`), and the tells (gradients, emoji icons, nested cards, eyebrow labels, buzzwords, invented numbers; English copy rules only for English products) |

## Design-system corpus

| Source | By, licence | Used for |
|---|---|---|
| open-design `design-systems/` at a pinned commit | nexu-io, Apache-2.0 | `npm run eval:tokens`: the token reader and design-system checks run over its 152 DESIGN.md files. `scripts/styles.mjs`: 52 generic style families (`catalog/styles.yaml`) as DESIGN.md starting points for a phone app: their visual language only (they were written for websites), the platform's type scale, and the HIG or Material 3 for layout and components, written with their attribution. Systems modelled on a named company, product, game or person are eval data only |

libraries.dev (Jakub Antalik) is on the catalog's watch list, not used: it's React for the web
first, and its native ports aren't published yet.

## When connected or installed

| Tool | By | Role |
|---|---|---|
| Mobbin MCP | Mobbin (official, paid) | Shipped iOS and web screens and flows for reference |
| Refero MCP | Refero (official, paid for search) | Alternative reference source: websites and iOS apps. Add the connector alone: `claude mcp add --transport http refero https://api.refero.design/mcp`, then sign in from `/mcp`. Refero's plugin brings its `refero-design` skill too (see below) |
| Figma MCP | Figma (official) | Figma frames as inputs; variables into DESIGN.md |
| Claude artifact tools | Anthropic | Pull Claude artifacts into a run |
| `material-3` skill | hamen | Companion guidance for Android screens |
| Expo skills | Expo (official) | Companion guidance for Expo / React Native projects |
| `hcd-interviewer` | Anthropic | Plans real user interviews when the frame rests on assumptions |

When companion guidance and a primary source disagree, the critic follows the primary source
(Apple HIG, Material 3, WCAG) and says so.

## Design files and native apps

| Tool | By | Role |
|---|---|---|
| Figma REST API | Figma (official; personal access token) | `scripts/import/figma-flows.mjs` reads a prototype's flow starting points and interactions (fields per Figma's published OpenAPI spec, github.com/figma/rest-api-spec) and writes the navigation graph the structure checks read. Tested on a recorded file shape; not yet run against the live API from this repository |
| Maestro CLI | mobile.dev, Apache-2.0 | `scripts/capture/native.mjs` (experimental) replays taps on a simulator or emulator and reads the accessibility hierarchy (`maestro hierarchy`). Scripted, so repeatable; analytics on by default, turned off by the script. No physical iOS devices |
| `adb`, `xcrun simctl` | Google; Apple | Appearance, text size and screenshots for native capture |

## Considered and not used

The tools that were reviewed and left out, each with the reason, are in
[considered.md](considered.md). Read it before proposing a new companion.

## Why the principles index exists

Critics cite principle IDs (`NN-H5`, `WCAG-3.3.2`, `IOS-DESTRUCTIVE`) so findings from different
tools can be merged, de-duplicated and scored against the eval set. The index
(`skills/principles/`) summarises primary sources: Nielsen, Norman, Wharton et al., WCAG 2.2, the
HIG and Material 3. It's a citation index, not a separate method.

## Running apps

Native capture (above) covers screens reached by taps on a simulator or emulator, with two
checks from the accessibility hierarchy. Screenshots taken with MobileBuildMCP or Xcode
Previews, Android CLI, Expo MCP, mobile-mcp or agent-device still work as image inputs (critics
only, see inputs.md). Next: crawling and journeys on native apps; the platform's own
accessibility audits (XCUITest `performAccessibilityAudit`, Android's Accessibility Test
Framework), which need test code in the app project; and for Capacitor apps, Playwright's
experimental Android WebView support, which would run the full HTML checks inside the real shell.
MCP servers that drive a device one model call at a time (Maestro MCP, mobile-mcp, Appium MCP)
stay fallbacks: a scripted run is repeatable and costs no judgement.
