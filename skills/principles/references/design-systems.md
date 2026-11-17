# Design systems

Sources: the Smpl design-system guide (Andreas Melvær, Smpl, 2026), whose "eight essentials"
this file follows; Google Labs' DESIGN.md format; Material 3 colour roles; Figma's
design-system rules for agents. The deterministic design-system checks cite these IDs.

| ID | Principle | Look for |
|---|---|---|
| `DS-ROLES` | Colours have jobs, not just swatches: surface, text, action, error/warning | Tokens named by hue only (`green-500`) with no role; no error or warning role |
| `DS-CONTRAST` | Every text-on-surface role pair meets contrast (see `WCAG-1.4.3`), in light and dark | `on-surface-variant` too light on `surface`; dark-mode pairs never checked |
| `DS-SCALE` | One spacing scale, 4- or 8-based; a type scale decided once | Spacing values like 10, 14, 18; ad-hoc font sizes outside the scale |
| `DS-ESSENTIALS` | The system documents the eight essentials: colour, type, spacing, buttons (primary, secondary, destructive; hover, focus, disabled, loading), forms (labels, help, errors), navigation (where search lives, how to go back, current place), empty and error states, voice | Screens that improvise these because the system is silent about them |
| `DS-AGENT-RULES` | Agents are told the rules: read the system before building UI, use only its tokens and components, stop and ask when something is missing | A CLAUDE.md without a design-system rule; agents inventing components |
