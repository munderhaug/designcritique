# Sparring: cold read, frame challenge, discussion

The critics judge screens against the frame, independently and cold. That finds defects. It
can't find a wrong frame, and it can't be argued with. Three stages around the critics do that.
Sources and IDs: `skills/principles/references/framing.md`.

## 1. Cold read (before anyone sees the frame)

The `cold-reader` agent gets numbered copies of the screenshots (`RUN_DIR/blind/`): no ids,
titles, notes, journey names or file names. It says what the product is, who it is for, what
problem it answers and what a person can evidently do. Saved as `blind/reading.json`.

- It runs first and the critics never see it. The frame challenger does.
- A difference from the frame is a question, never a defect: either the screens don't say it, or
  the frame isn't what was built. Only the designer can tell which.
- Being opaque to a stranger matters most when the frame's users are first-time or untrained.
  A tool for trained users, or one reached through an invitation, needn't explain itself.
- A model reading cold is not a user. The report says so.

## 2. Frame challenge (before the screens are judged)

The `frame-challenger` agent applies `product-brainstorming`'s assumption testing to
`framing.md`, with the cold reading beside it. It returns `challenges`: a position, the reasoning,
a question and what changes if it is right. No findings, no severity, no score.

Then the conversation stops for the designer: show the cold reading beside the frame and the
questions; argue the strong ones as someone who holds the view (an assigned contrary role is
easy to wave away: Nemeth et al., 2001); let the designer answer, change the frame or leave it.
Answers are recorded (`decide.mjs --challenge C2 --answer "…"`) and given to later runs, so a
question isn't asked twice without new evidence.

## 3. Discussion (after the report)

The **discuss** skill puts the designer's argument against a finding to the critic that raised
it, with the evidence. The critic holds, concedes or revises, and says why. Either way the
exchange is kept with the decision and shown under the finding.

## What keeps this honest

- Findings and challenges stay apart. A finding has evidence, a user, a task and a severity,
  and can gate. A challenge is a position and a question, and never gates.
- Critics put uncertain or concept-level concerns in `challenges` instead of dropping them or
  dressing them up as defects, other ways to solve a finding in its `alternatives`, and what
  they didn't look at in `not_examined`.
- Independence is kept: the cold reader knows nothing, the critics don't see each other or the
  cold reading, and a critic in a discussion sees only its own finding and the designer's case.
