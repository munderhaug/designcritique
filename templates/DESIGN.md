---
name: <Design system name>
description: <One line on the visual intent.>
colors:
  primary: "#2457D6"
  on-primary: "#FFFFFF"
  surface: "#FFFFFF"
  on-surface: "#16181D"
  on-surface-variant: "#5B6170"
  surface-container: "#F3F5F9"
  outline: "#D5D9E2"
  error: "#C62828"
  dark-primary: "#8FB0FF"
  dark-on-primary: "#0B1F55"
  dark-surface: "#121418"
  dark-on-surface: "#ECEEF3"
  dark-on-surface-variant: "#A8AEBB"
  dark-surface-container: "#1E2128"
  dark-outline: "#363B46"
  dark-error: "#FF8A80"
typography:
  font-family: "-apple-system, system-ui, sans-serif"
  font-sizes: [11, 12, 13, 14, 15, 16, 17, 20, 22, 28, 34]
spacing: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128]
rounded: [8, 12, 16, 999]
---

# <Design system name>

Tokens live in the YAML front matter above, loosely modelled on Google's DESIGN.md format
(github.com/google-labs-code/design.md) but not identical to it. designcritique reads any colour, spacing, font-size and
radius values it finds there, whatever the exact key names. It also reads Markdown tables and
"- name: value" lists under headings such as Colours, Spacing, Typography and Radius: the first
column is the token name, and a column headed "Dark" holds the dark value.

## Intent

<What the visual design should feel like, and why. Two or three sentences.>

## Rules

- <e.g. One filled primary button per screen; secondary actions are text buttons.>
- <e.g. Body text is 17 (iOS) / 16 (Android). Secondary text uses on-surface-variant.>
- <e.g. Spacing comes from the 4-point scale.>
