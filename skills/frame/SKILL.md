---
name: frame
description: Human-centred problem framing for a mobile app before designing or critiquing it - who it is for, what problem it solves, context of use, ranked key tasks and success criteria - recorded in PRODUCT.md. Builds on Impeccable's init (product record) and adds the human-centred layer the critique needs. Use when PRODUCT.md is missing, thin, or has no key tasks; the critique skill runs it first.
---

# Frame the problem

Design starts with the problem, not the screens. This skill doesn't invent its own product
record. It uses **Impeccable's `init`** (Paul Bakaus), which interviews you and writes
`PRODUCT.md`: Platform, Stack, Users, Product Purpose, Operating Context, Capabilities and
Constraints, Accessibility. Then it adds the human-centred sections the critique judges against
(ISO 9241-210 / 9241-11, jobs to be done). [framing-guide.md](references/framing-guide.md)
explains each one.

## Steps

1. **Run Impeccable's init.** If the Impeccable skill is installed, run `/impeccable init` and let
   it write or update `PRODUCT.md`, including `## Platform` (`ios`, `android` or `adaptive`) and
   `## Stack`. If it isn't installed, write the same sections yourself from
   [the template](../../templates/PRODUCT.md), interviewing the user in the same way, and suggest
   installing Impeccable (`npx impeccable install -y --providers=claude --scope=project`).
2. **Add the human-centred layer** to the same file. Impeccable keeps extra headings.
   - `## Problem`: what goes wrong for the primary user today, stated without the solution.
   - `## Key Tasks`: two to five job stories, ranked by criticality, one marked "must not fail".
   - `## Success Criteria`: effectiveness, efficiency and satisfaction, in terms a reviewer can
     judge from screens.
   Ask at most three questions at a time, only for what the repository and the user haven't
   already answered. Use the question tool when available.
3. **Tag evidence.** Mark each added statement `[confirmed]`, `[inferred]` (name the clue) or
   `[assumption]` (say what changes if it's wrong). Never invent research, personas or numbers.
4. **For a whole-product review, add the product sections** (`## Journeys`, `## Concept model`,
   `## Scope`, `## Feature map`, optionally `## Navigation`; formats in the template). Read the
   project's documents first (roadmap, spec, content guide, DESIGN.md, decisions) and derive them,
   naming the source document for each line; then ask only about what's missing, at most three
   questions at a time. If mockups.yaml has no `journeys:`, offer to write them from `## Journeys`.
5. **Point at research when it's thin.** If key tasks rest on assumptions, suggest Anthropic's
   `user-research` skill (design plugin) or the `hcd-interviewer` skill to plan real interviews.
   If Mobbin or Refero is connected, looking at how shipped apps handle the key tasks helps make
   them concrete; record what you learn as `[inferred]`.
6. **Check before finishing.** The file names a specific primary user, a problem without a
   solution in it, ranked key tasks with one must-not-fail, and judgeable success criteria.
   Then report in two or three lines what changed and which assumptions are open.
