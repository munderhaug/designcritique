---
name: frame
description: Human-centred problem framing for an app or feature - what problem it solves, who it is for, their context of use, key tasks and how success is measured - written to PRODUCT.md. Use before designing or critiquing any app screens, when PRODUCT.md is missing or thin, or when the user asks what the app is for or who it serves. The critique skill runs it first.
---

# Frame the problem

Design starts with the problem, not the screens. This skill produces a short `PRODUCT.md`.
The critique judges every screen against it, so a vague frame makes a vague critique.

Follow the human-centred design process in ISO 9241-210: understand and specify the
context of use, then the user requirements. Only after that come design and evaluation.
Read [framing-guide.md](references/framing-guide.md) for the questions and formats.

## Steps

1. **Gather what exists.** Read `PRODUCT.md`, `README`, `CLAUDE.md`, any brief or research notes,
   and the mockups themselves (text, labels and flows say a lot about the intended user).
2. **Draft the frame** using [the template](../../templates/PRODUCT.md). Fill every section.
   Tag every statement with its evidence level:
   - `[confirmed]`: the user said it, or it comes from research.
   - `[inferred]`: deduced from the mockups or repo, with the clue named.
   - `[assumption]`: a guess that needs checking.
3. **Ask, if someone is there.** Ask at most three questions at a time, about whatever would
   change the critique most. That's usually who the primary user is, the one task that must
   not fail, and the context of use. Use multiple-choice questions where possible. If nobody
   is there to answer (a scheduled or unattended run), keep the `[assumption]` tags and carry on.
4. **Check the frame before saving.** It must name:
   - a specific user, not "everyone";
   - a problem stated without the solution;
   - two to five key tasks ranked by criticality;
   - success criteria the screens can be judged against.
5. **Write `PRODUCT.md`** next to `mockups.yaml`, or at the project root. Keep the `## Platform`
   section: Impeccable reads it too.
6. **Say what changed** in two or three lines, listing the open assumptions.

If the frame rests on untested assumptions about users, suggest real research. The
`hcd-interviewer` skill (Anthropic), where available, plans and runs user interviews. If the
Mobbin MCP is connected, looking at how shipped apps handle the key tasks helps make the tasks
concrete; record what you learned as `[inferred]`.

Never invent research findings, personas with fake names and photos, or statistics. A named
example user is fine when it's clearly labelled as illustrative.
