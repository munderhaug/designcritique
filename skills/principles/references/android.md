# Android: Material 3 and platform conventions

Sources: Material Design 3 (m3.material.io), including Material 3 Expressive, and Android
developer guidance (developer.android.com). Check the live docs for current component specs.

| ID | Convention | Look for |
|---|---|---|
| `AND-NAV-BAR` | Navigation bar for 3–5 top-level destinations; navigation rail or drawer on larger screens or with more destinations | Bottom bars with 2 or 6+ items; tabs used as primary navigation |
| `AND-APPBAR` | Top app bar (small, centre-aligned, medium or large) with up/back navigation; screens work with predictive back | Pushed screens with no up arrow; iOS-style back chevron with text label |
| `AND-BUTTONS` | Button hierarchy: filled (highest emphasis), tonal, outlined, text; at most one FAB, for the screen's primary action | Several filled buttons competing; FAB for a minor action |
| `AND-FEEDBACK` | Snackbars for brief feedback, with undo after destructive actions; dialogs only for decisions that need one | Dialogs for confirmations that could be undo; silent actions |
| `AND-TYPE` | M3 type scale: Display, Headline, Title, Body, Label roles (Body Large 16 sp, Body Medium 14 sp, Label Small 11 sp at default size); sizes in sp | Arbitrary sizes; body below 14 sp; text that won't scale |
| `AND-LAYOUT` | Edge-to-edge with insets handled; 16 dp margins on phones; 8 dp grid (4 dp for small elements) | Controls in the status or gesture bar areas; uneven margins |
| `AND-COLOR` | Colour roles (primary, secondary, tertiary, surface containers, on-colours), tonal elevation, dynamic colour and dark theme ready | Hard-coded colours; shadows used where tonal surfaces belong |
| `AND-SHAPE` | Consistent shape scale (corner families) | Random radii per component |
| `AND-TARGET` | Touch targets at least 48×48 dp | Small icon buttons; dense chips |
| `AND-ICONS` | Material Symbols, consistent style and weight | Mixed icon sets; emoji as icons |
| `AND-NOT-IOS` | Android-native idioms | iOS switches, action sheets, chevron-plus-label back buttons on Android |
| `AND-MOTION` | Material 3 motion: easing and duration tokens, container transforms, and the Remove animations setting respected | Arbitrary durations; overlays that pop in with no transition; animations ignoring the system setting |
