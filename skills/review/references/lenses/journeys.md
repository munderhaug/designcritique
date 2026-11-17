# Lens: journeys (for the existing critics in review mode)

Sources: Shostack, "Designing Services That Deliver", *HBR* (1984); Patton (2014); the cognitive
walkthrough (Wharton et al., 1994) applied to every step; Kahneman et al. (1993) peak–end.
Principle IDs: `JOURNEY-*` plus `TASK-WALK-Q1`–`Q4`.

The design-reviewer and Impeccable each get, per journey, its screens in step order and the tap
that led to each. Besides their usual findings, they return `journeys`: for every step a
verdict (`ok`, `friction`, `blocked`) with a note, and for the journey a verdict and a score
using the key-task anchors. Look across steps for:

- **Entry:** does the journey start where the situation starts (`JOURNEY-ENTRY`)?
- **Hand-offs:** at each step, is it clear why you're here and what's next; does context carry
  over (`JOURNEY-HANDOFF`)?
- **Ways back and dead ends:** use `checks/structure.json`; judge how much they hurt on this
  journey (`JOURNEY-WAY-BACK`, `JOURNEY-DEAD-END`).
- **Loops:** does the end lead into the next stage the product promises (`JOURNEY-CLOSE`)?
- **Peak and end:** is the most stressful step and the ending designed with care
  (`JOURNEY-PEAK-END`; Impeccable's emotional journey)?
