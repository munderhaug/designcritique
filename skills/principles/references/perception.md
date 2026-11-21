# Perception and visual design

## Gestalt principles of grouping

Sources: Wertheimer (1923) and the Gestalt school; common region from Palmer, "Common region:
a new principle of perceptual grouping" (*Cognitive Psychology*, 1992).

| ID | Principle | On a phone screen, look for |
|---|---|---|
| `GESTALT-PROXIMITY` | Things close together are seen as related | Labels nearer to the wrong field; equal spacing everywhere so nothing groups; section gaps no larger than item gaps |
| `GESTALT-SIMILARITY` | Things that look alike are seen as alike | Primary and destructive buttons styled the same; links styled like body text; inconsistent card styles for the same object |
| `GESTALT-REGION` | Things inside a shared boundary are seen as a group | Unrelated items in one card; related items split across cards; cards nested in cards |
| `GESTALT-FIGURE` | Figure–ground separation | Sheets, dialogs and overlays that don't separate from what's behind them; text on busy imagery |
| `GESTALT-CONTINUITY` | The eye follows lines and alignments | Ragged left edges; mixed alignments that break the reading path |

## Visual hierarchy and craft

| ID | Principle | Look for |
|---|---|---|
| `VIS-HIERARCHY` | Importance is shown through size, weight, contrast, position and space | Several elements competing for first glance; the primary action not the most prominent; flat screens where nothing leads |
| `VIS-TYPE` | Typography supports reading | Too many sizes or weights; weak contrast between levels; long lines; cramped line height; centred multi-line body text |
| `VIS-COLOR` | Colour carries meaning consistently | Accent used for both decoration and interaction; status shown by colour alone (also `WCAG-1.4.1`); too many hues |
| `VIS-SPACING` | Space creates rhythm and grouping | Spacing off the scale; inconsistent margins; crowded touch areas |
| `VIS-ISOLATION` | Von Restorff (isolation) effect: the item that differs is remembered and noticed | Use it for the one primary action. Several "different" items cancel each other out |
| `VIS-MOTION` | Motion explains change: where something came from and went | Overlays that appear with no transition; closes slower or bouncier than opens; delayed dismissals; a different duration for every element |

Sources for hierarchy, colour and spacing: Lidwell, Holden & Butler, *Universal Principles of
Design* (Rockport, 2003): the entries Hierarchy, Highlighting, Color, Alignment and Proximity;
Ware, *Information Visualization: Perception for Design* (2nd ed., Morgan Kaufmann, 2004), on
what the eye picks out first. For type: Bringhurst, *The Elements of Typographic Style* (Hartley
& Marks, 1992), on measure, leading and scale.
Source for the isolation effect: Hedwig von Restorff (1933), who measured recall of the item
that differs; that it is also noticed first rests on Ware (above). Motion: Material 3 motion guidance,
Apple HIG Motion, and the motion-token rules of transitions.dev (Jakub Antalik), which the
transitions-agent scanner applies to HTML mockups.
