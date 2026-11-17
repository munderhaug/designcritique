# iOS: Apple Human Interface Guidelines (iPhone)

Source: Apple, Human Interface Guidelines (developer.apple.com/design/human-interface-guidelines).
Liquid Glass (`IOS-MATERIALS`): HIG Materials; Apple, "Adopting Liquid Glass"; WWDC25 sessions 219
(Meet Liquid Glass), 284 (UIKit) and 323 (SwiftUI). Citations collected by 2dubu/liquid-glass (Apache-2.0).
Check the live guidelines for the current OS release; these are the stable conventions.

| ID | Convention | Look for |
|---|---|---|
| `IOS-NAV-TABBAR` | Tab bar for top-level sections: bottom, 2–5 tabs, icon plus label, always visible at top level | A hamburger or drawer as primary navigation; more than five tabs; actions placed in the tab bar |
| `IOS-NAV-STACK` | Navigation bar with back button (chevron plus previous title) on pushed screens; large titles at top level | Pushed or task screens with no way back; custom back controls in odd places |
| `IOS-MODAL` | Sheets for focused, self-contained tasks, with Cancel and Done/confirm in the navigation bar | Full-screen modals for small tasks; modals without a clear way out |
| `IOS-CONTROLS` | Standard controls: switches for on/off, segmented controls, pickers, menus, action sheets | Web checkboxes or radio rows; custom toggles that don't look like switches |
| `IOS-DESTRUCTIVE` | Destructive actions use the red destructive style, are separated from the primary action and are confirmed (action sheet or alert) or undoable | "Delete" styled like the primary action or placed next to it |
| `IOS-TYPE` | Dynamic Type text styles (Large Title 34, Title 1 28, Title 2 22, Title 3 20, Headline 17 semibold, Body 17, Callout 16, Subheadline 15, Footnote 13, Caption 1 12, Caption 2 11, at default size) | Arbitrary sizes; body below 17; text that won't scale |
| `IOS-LAYOUT` | Respect safe areas (status bar, Dynamic Island, home indicator); standard margins; content first | Controls under the status bar or home indicator; edge-to-edge text with no margins |
| `IOS-LISTS` | Grouped and plain list styles, 44 pt minimum rows, disclosure chevrons for navigation | Card stacks used where a list fits better; chevrons on rows that don't navigate |
| `IOS-TARGET` | Hit targets at least 44×44 pt | Small icon buttons, tight inline links |
| `IOS-ICONS` | SF Symbols-style icons that match the weight and size of adjacent text | Mixed icon styles; emoji as icons |
| `IOS-COLOR` | Semantic system colours, one tint colour for interactive elements, full dark appearance | Hard-coded colours that break in dark mode; tint used for decoration |
| `IOS-MATERIALS` | Since iOS 26, system bars and controls use Liquid Glass, which separates controls and navigation from content; content stays in the content layer. Regular glass for controls and text-heavy surfaces; clear glass only over rich media, with legible controls (the HIG suggests considering 35% dark dimming over bright content). Tint for meaning or the primary action, not branding. The material adapts to Reduce Transparency, Increase Contrast and Reduce Motion; custom elements must still be checked under them | Glass on content cards; regular and clear variants mixed in one group; every control tinted; text on clear glass over busy imagery; custom glass or colours that break with Reduce Transparency or Increase Contrast |
| `IOS-MOTION` | Motion is purposeful and brief, follows system springs, and honours Reduce Motion (cross-fades instead of slides) | Decorative motion on every element; long or bouncy dismissals; no reduced-motion path |
