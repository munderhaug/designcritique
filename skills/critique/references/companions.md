# Companions: the proven tools designcritique builds on

designcritique adds the parts nobody else provides: problem framing, mobile evidence capture,
independent critics, calibration and a merged report. For everything else it uses established
tools. Run `node PLUGIN_ROOT/scripts/companions.mjs --project <project>` to see which are installed.

## Used in every run

| Tool | By | Role in designcritique |
|---|---|---|
| Playwright | Microsoft | Renders HTML mockups at phone sizes, light/dark, large text |
| axe-core (`@axe-core/playwright`) | Deque | Accessibility rules engine (WCAG 2.x A/AA, best practice) |
| DESIGN.md format | Google Labs | Token file the token checks read |
| Impeccable | Paul Bakaus | Default critique stage: its `critique` (scored UX review) and `audit` (technical quality) on HTML mockups, with `## Platform` from PRODUCT.md switching it to the HIG or Material 3. Its detector runs via `npx impeccable detect --json`. Install: `npx impeccable install -y --providers=claude --scope=project` |

If Impeccable isn't installed, the run continues without that stage and the report says so.
Recommend installing it once.

## Used when available

| Tool | By | Role | Install |
|---|---|---|---|
| Mobbin MCP | Mobbin (official, paid plans) | Reference screens and flows from shipped apps for each key task; critics compare against them. iOS and web only | `claude mcp add --transport http mobbin https://api.mobbin.com/mcp`, then sign in via `/mcp` |
| Figma MCP | Figma (official) | Exports Figma frames as PNG inputs; reads variables into DESIGN.md | `claude plugin install figma@claude-plugins-official` |
| Claude artifact tools | Anthropic | Pull Claude artifacts into the run | Built into Claude sessions that offer artifacts |
| `material-3` skill | hamen/material-3-skill | Companion guidance for Android screens (Material 3, M3 Expressive, compliance audit) | `npx skills add hamen/material-3-skill --skill material-3 -a claude-code` |
| `ui-design` plugin (platform-audit) | Owl-Listener/designer-skills | Companion guidance for iOS/Android convention audits | `/plugin marketplace add Owl-Listener/designer-skills`, then `/plugin install ui-design@designer-skills` |
| Expo skills (`expo-design-system`, `expo-native-ui`) | Expo team (official) | Companion guidance for Expo / React Native projects | `claude plugin install expo@claude-plugins-official` |
| `hcd-interviewer` skill | Anthropic | Plans real user interviews when the frame rests on untested assumptions | Available in Claude where listed |

"Companion guidance" means the ui critic reads that skill's SKILL.md (and any reference it
points to) alongside the principles library. The critic still cites principle IDs; companion
guidance sharpens what it looks for. If a companion and a primary source disagree, follow
the primary source (Apple HIG, Material 3, WCAG) and say so.

## Next version (running apps, not mockups)

MobileBuildMCP (Sentry, formerly XcodeBuildMCP), Maestro MCP (mobile.dev), Expo MCP (local
capabilities), Android CLI (Google), mobile-mcp (mobile-next), and Apple's exported Xcode 27
skills for SwiftUI source. These capture real screens and accessibility trees from simulators
and emulators, and plug into the same checks, critics and report.
