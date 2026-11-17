# Framing guide

## Foundations

- **Human-centred design process**: ISO 9241-210:2019, *Human-centred design for interactive systems*.
  Understand and specify the context of use, specify user requirements, produce design solutions,
  evaluate them against the requirements, and iterate.
- **Usability**: ISO 9241-11:2018. Usability is the extent to which specified users can achieve
  specified goals with effectiveness, efficiency and satisfaction in a specified context of use.
  Every part of that sentence needs filling in before usability can be judged.
- **Jobs to be done**: Christensen et al., *Competing Against Luck* (2016). People "hire" a product
  to make progress in a situation. A job story reads: *When [situation], I want to [motivation],
  so I can [expected outcome].*
- **Inclusive design**: Microsoft Inclusive Design toolkit. Consider permanent, temporary and
  situational limits (the "persona spectrum").

## How the sections map to Impeccable's PRODUCT.md

Impeccable's `init` already records Platform, Stack, Users, Product Purpose, Operating Context
(which is the ISO "context of use"), Capabilities and Constraints, Evidence on Hand and
Accessibility & Inclusion. designcritique adds three sections: Problem, Key Tasks and Success
Criteria. The questions below cover all of them, so the frame can be written by hand when
Impeccable isn't installed.

## Sections and the questions behind them

**Problem.** What goes wrong for people today, and what does it cost them? State it without
the solution: write "Commuters miss connections because…", not "Users need a train app". If the
problem is unknown, say so; the critique will then flag every screen as unverifiable on task fit.

**Users.** Who has the problem most acutely (primary), who else is affected (secondary), and
who is explicitly not served? Name relevant abilities and constraints: experience with similar
apps, language, vision, motor control, attention.

**Operating Context** (ISO 9241-11's context of use). Where, when and how the app is used: one-handed or two, moving
or seated, glanceable or focused, connectivity, interruptions, privacy of the surroundings.

**Key Tasks.** Two to five tasks, each as a job story, ranked by criticality: what fails if this
task fails? Mark the task that must never fail.

**Success Criteria.** How you would tell the design works, in ISO 9241-11 terms:
- *effectiveness*: can they complete it at all, with what error rate?
- *efficiency*: how many steps, how much time, how much thinking?
- *satisfaction*: confidence, trust, perceived effort.

Prefer criteria a reviewer can judge from screens, such as "the total is visible when paying" or
"booking takes three taps or fewer from home".

**Platform.** `ios`, `android` or `adaptive`, plus minimum OS if known.

**Constraints.** Brand, regulation, technology, timeline, existing design system.

**Evidence and assumptions.** What research exists, and what is assumed. Each assumption should
say what would change if it turned out wrong.

**Out of scope.** What this version deliberately doesn't do. This stops the critique from asking
for it.

## Inferring a frame from mockups

Use the screens as evidence, and say which screen told you what:
- Copy and labels reveal the audience and its vocabulary.
- The screen sequence reveals the intended tasks.
- Data shown (prices, dates, people) reveals the domain and the decisions users make.
- What's missing (no back button, no error state) is a finding for later, not part of the frame.

Inferred frames are hypotheses. Tag them `[inferred]` and confirm the top one or two with the
person.
