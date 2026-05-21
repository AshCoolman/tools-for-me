# Failure Modes

Common ways implementations drift from Contract Slice contracts, and how to detect them.

## Silent type widening

Contract says `string`, implementation accepts `string | undefined`. The runtime behaviour changes but the test suite may not catch it if tests only exercise the happy path.

Detection: `expectTypeOf` type tests, strict schema at boundary.

## Missing error paths

Contract says "throws on invalid input", implementation silently returns null or an empty object.

Detection: explicit tests for each failure mode listed in the contract.

## Schema/type mismatch

TypeScript types and Zod schemas diverge. The type says `role: 'admin' | 'member'` but the schema allows any string.

Detection: derive types from schemas (`z.infer<typeof Schema>`) rather than maintaining both separately.

## Partial contract satisfaction

Implementation satisfies the happy-path postcondition but not the invariant. E.g., sort function returns sorted output but doesn't preserve element count.

Detection: property tests that assert invariants (count preserved, no new elements, etc.).

## Gate bypassing

Test passes because the assertion was weakened (`.toBeUndefined()` changed to `.toBeDefined()`), not because the code improved.

Detection: `cslice-verify.sh` checks for weakened assertions in staged diffs.

## Scope creep

Implementation changes files outside the listed scope, introduces new dependencies, or refactors adjacent code.

Detection: `git diff --stat` before commit, review "Gates to run" output from `/cslice.implement`.

## Any-escape

An `as any` or `: any` annotation removes type safety at a boundary, allowing incorrect data to flow through.

Detection: `cslice-verify.sh` grep for `as any` and `: any` in staged diffs.
