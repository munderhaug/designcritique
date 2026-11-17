// Principle-ID matching for the eval scorer and the decisions file.
// `want` matches the same ID, or a family of IDs under it: "IOS-NAV" matches "IOS-NAV-STACK".
// It never matches a longer number: "WCAG-1.4.1" does not match "WCAG-1.4.11", nor "NN-H1" "NN-H10".
export function idMatches(id, want) {
  return id === want || id.startsWith(`${want}-`);
}

/** Does a finding cite `want` in its rule or basis? */
export function findingCites(f, want) {
  return [f.rule, ...(f.basis || [])].filter(Boolean).some((id) => idMatches(id, want));
}
