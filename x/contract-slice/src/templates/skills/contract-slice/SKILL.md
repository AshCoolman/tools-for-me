---
name: contract-slice
description: Use when turning loose implementation intent into AI-generated contracts, tests, gates, and then implementation.
---

# Contract Slice

Contract Slice turns loose implementation intent into executable guardrails before coding.

Workflow:

Intent → Contract Discovery → Review → Tests/Gates → Implementation → Verification

Use it when:
- the user has a real implementation intent but not a full spec
- correctness matters
- the stack can express useful contracts
- TypeScript runtime/type boundaries need explicit checks
- tests can be derived from invariants
- edge cases are unclear and need discovery
- implementation should be constrained by generated guardrails

Best fits:
- Rust
- TypeScript with runtime schemas
- strict TypeScript libraries
- config/schema-heavy systems
- API adapters
- graph/data transforms
- ranking/sorting/reordering engines
- serialization/deserialization logic

Do not use it for:
- broad architecture planning
- multi-week roadmaps
- vague product discovery
- agent orchestration
- cosmetic-only changes

Rules:
1. Preserve uncertainty at the intent stage.
2. Discover contracts before implementation.
3. Review contracts before tests.
4. Generate tests from contracts.
5. Implement minimal diff.
6. Verify against hard gates.
7. Inspect for cheating: skipped tests, weakened assertions, `any`, `ts-ignore`, threshold changes.

See references:
- references/theory.md
- references/typescript-contracts.md
- references/runtime-schemas.md
- references/property-tests.md
- references/failure-modes.md
- references/hard-gates.md
