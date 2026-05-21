# Contract Slice Theory

Contract Slice works best in contract-friendly stacks where correctness can be expressed as compiler checks, runtime validation, tests, and hard gates.

## Best fits

- Rust — compiler + ownership + explicit errors + type boundaries
- TypeScript with runtime schemas — types + Zod/Valibot/ArkType at trust boundaries
- TypeScript with strict compiler settings — narrowed unions, no implicit any
- schema-heavy systems — config loading, API adapters, serialization
- data transforms — graph operations, ranking, sorting, reordering
- permission/filtering logic — clear input/output invariants

## Weaker fits

- purely visual UI polish — correct is largely subjective
- vague product exploration — contracts require at least an intent
- broad architecture planning — too early for executable guardrails
- codebases without test infrastructure — nowhere for generated tests to land

## Why TypeScript needs extra guardrails

TypeScript types are erased at runtime. An `any` cast, a missing schema, or an unchecked external input can break a correct-looking type system silently.

Contract Slice compensates with:
- strict TypeScript (`noImplicitAny`, `strictNullChecks`)
- runtime schemas at trust boundaries (Zod/Valibot/ArkType)
- type-level tests (`expectTypeOf`, `tsd`) for public API shape
- example tests for concrete input/output pairs
- property tests (`fast-check`) for broad input spaces
- shell gates for suspicious diffs

## Why Rust works without these extras

The Rust compiler enforces ownership, lifetimes, and exhaustive pattern matching at compile time. There is no runtime type erasure. Property tests and example tests add value, but the hard gates are already built into the compiler.
