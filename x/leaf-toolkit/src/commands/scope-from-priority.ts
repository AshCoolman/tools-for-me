// `leaf scope-from-priority` — emit JSON listing files that belong to leaves
// of `low` or `lowest` priority. Downstream tools (vitest coverage.exclude,
// eslint .ignore, sonar.exclusions, …) consume this to derive their scope.
//
// **Rule:** the priority field is the only lever. Hand-editing a tool's
// exclude list to "make a number look better" is forbidden — raise (or accept)
// the priority instead.
//
// Stub: port from scripts/leaf-coverage-scope.mts. Generalised here so the
// output is domain-agnostic; consumers pick which priorities they care about.

export async function scopeFromPriority(_argv: string[]): Promise<void> {
  throw new Error("not yet ported — see fe-mono-closed/scripts/leaf-coverage-scope.mts");
}
