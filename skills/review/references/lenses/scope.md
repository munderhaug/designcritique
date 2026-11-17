# Lens: concept and scope

Sources: Christensen et al., *Competing Against Luck* (2016) (jobs to be done); Ulwick, *What
Customers Want* (2005); Torres, *Continuous Discovery Habits* (2021) (opportunity solution
trees); Patton, *User Story Mapping* (2014) (release slices). Principle IDs: `SCOPE-*`.

When Anthropic's product-management plugin is installed, read its `product-brainstorming`
(jobs-to-be-done and opportunity-solution-tree sections) and `write-spec` (scope and non-goals)
SKILL.md files at the paths in your brief and use them as the method. They are written for
generating ideas; here they are tests:

1. **Trace every feature** (feature map plus anything the screens show that isn't in it) to a job,
   a problem part and a key task. A feature that traces to nothing is `SCOPE-NO-JOB`.
2. **Trace every job and key task** to the features that serve it. A key task with no feature, or
   a problem part nothing addresses, is `SCOPE-GAP`. If the capture didn't reach it, say "not
   covered", not "missing".
3. **Better alternatives.** For each must-not-fail and high-ranked task, name at least one other
   way it could be served (Torres: compare solutions per opportunity). If an alternative is
   clearly simpler or faster for the described users, it's `SCOPE-ALTERNATIVE`.
4. **Phase fit.** Compare what's built and polished with the Scope section: later features built
   before MVP must-haves, or out-of-scope items present, are `SCOPE-PHASE` / `SCOPE-OUT`.

Return the `scope` array (one entry per feature: keep, cut, add, move, defer or rethink, with the
job and task it serves) and findings for every cut, add and rethink. `"critic": "scope"`.
