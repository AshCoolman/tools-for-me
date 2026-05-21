# Contract Slice Theory

Contract Slice works best when the target stack can express contracts clearly.

It is strongest in contract-friendly tech stacks where correctness can be made executable through compiler checks, runtime validation, tests, and hard gates.

## Best fits

- Rust
- TypeScript with runtime schemas
- TypeScript with strict compiler settings
- TypeScript libraries with stable public APIs
- backend/data code with explicit input/output boundaries
- config/schema-heavy systems
- API adapters
- graph/data transforms
- ranking/sorting/reordering engines
- permission/filtering logic
- serialization/deserialization logic

## Weaker fits

- purely visual UI polish
- vague product exploration
- brand/marketing copy
- broad architecture discovery
- changes where correctness is mainly subjective
- codebases with weak or absent test/gate infrastructure

## Why Rust works well

Rust gives strong executable feedback:

- compiler checks
- ownership constraints
- explicit error handling
- strong type boundaries
- good property-test targets

## Why TypeScript needs extra guardrails

TypeScript types are erased at runtime.

So Contract Slice works best in TypeScript when paired with:

- strict compiler settings
- runtime schemas
- type tests
- example tests
- property tests
- hard suspicious-diff gates

Good TypeScript tools:

- Zod / Valibot / ArkType for runtime schemas
- `tsc --noEmit` for compiler gates
- Vitest/Jest for example tests
- `expectTypeOf` / `tsd` for type-level API tests
- `fast-check` for property tests
- ESLint hard rules for escape hatches
- custom shell gates for suspicious diffs
