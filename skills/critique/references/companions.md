# What designcritique builds on

The judgement and the product record come from proven tools. This repo provides capture,
mobile checks for mockups, orchestration, the merged report, evals and the build-stack
catalog. Run `node PLUGIN_ROOT/scripts/companions.mjs --project <project>` to see what's installed.

## Core: needed for a full critique

| Tool | By | Role | Install |
|---|---|---|---|
| Impeccable | Paul Bakaus | `init` writes PRODUCT.md (used by the frame skill); `critique` is one of the two critics | `npx impeccable install -y --providers=claude --scope=project` |
| Anthropic design plugin | Anthropic (official) | `design-critique`, `accessibility-review`, `ux-copy` are the design-reviewer's methods; `user-research` for real research | `claude plugin marketplace add anthropics/knowledge-work-plugins` then `claude plugin install design@knowledge-work-plugins` |
| Playwright | Microsoft | Renders HTML mockups at phone sizes, light, dark and large text | npm dependency |
| axe-core | Deque | Accessibility rules engine | npm dependency |
| DESIGN.md format | Google Labs | Token file the token checks read | template in `templates/` |

`bash scripts/setup.sh --install-companions` installs Impeccable into the project and the
Anthropic design plugin for the user.

## Motion and design systems

| Tool or source | By | Role |
|---|---|---|
| transitions-agent | Jakub Antalik (transitions.dev), MIT | Deterministic motion scan of HTML mockups; imported as findings by `scripts/checks/motion.mjs` |
| transitions-dev, transitions-polish skills | Jakub Antalik | Motion recipes and token rules when fixing motion in HTML prototypes (web only; native apps follow platform motion) |
| Smpl design-system guide | Andreas Melvær, Smpl | The "eight essentials" behind the design-system checks, and the CLAUDE.md rule in `templates/CLAUDE-design-system.md` |

libraries.dev (Jakub Antalik) is on the catalog's watch list, not used: it's React for the web
first, and its native ports aren't published yet.

## When connected or installed

| Tool | By | Role |
|---|---|---|
| Mobbin MCP | Mobbin (official, paid) | Shipped iOS and web screens and flows for reference |
| Refero MCP | Refero (official, freemium) | Alternative reference source: websites and iOS apps |
| Figma MCP | Figma (official) | Figma frames as inputs; variables into DESIGN.md |
| Claude artifact tools | Anthropic | Pull Claude artifacts into a run |
| `material-3` skill | hamen | Companion guidance for Android screens |
| Expo skills | Expo (official) | Companion guidance for Expo / React Native projects |
| `hcd-interviewer` | Anthropic | Plans real user interviews when the frame rests on assumptions |

When companion guidance and a primary source disagree, the critic follows the primary source
(Apple HIG, Material 3, WCAG) and says so.

## Considered and not used (checked 2026-11-17)

Reviewed against the primary sources in the principles index. Re-check before adding any of them.

| Tool | Why not |
|---|---|
| designer-skills `ui-design` (Owl-Listener) | Was a companion until 0.2. Its platform-conventions skill contradicts the HIG and Material 3 (iOS tab bars "no labels required"; an Android left-edge drawer swipe "without conflicting" with system back) and gives WCAG large text as 18px/14px bold instead of 18pt/14pt; its responsive audit uses web breakpoints |
| ui-ux-pro-max (nextlevelbuilder) | A generator over large CSV data, most rows without sources; runs Python and writes into the project. Its accurate rules are already in the index |
| ux-ui-agent-skills (plugin87) | Hooks on every Write/Edit and a blocking Stop hook; brand design systems scraped from websites, some with failing contrast pairs |
| sumi (Phazur Labs), interface-design (Dammyjay93), mobile-app-ui-design (ceorkm) | Web-first, duplicate Impeccable's critique, or unlicensed and unsourced |

## Why the principles index exists

Critics cite principle IDs (`NN-H5`, `WCAG-3.3.2`, `IOS-DESTRUCTIVE`) so findings from different
tools can be merged, de-duplicated and scored against the eval set. The index
(`skills/principles/`) summarises primary sources: Nielsen, Norman, Wharton et al., WCAG 2.2, the
HIG and Material 3. It's a citation index, not a separate method.

## Running apps

Today: screenshots taken with MobileBuildMCP or Xcode Previews, Android CLI, Expo MCP,
mobile-mcp or Callstack's agent-device are image inputs (critics only, see inputs.md).
Next: driving those tools from capture, so live screens and their accessibility trees go through
the same checks, critics and report. Apple's Xcode 27 skills then apply to the SwiftUI source.
