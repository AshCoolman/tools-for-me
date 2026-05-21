# Contract Slice

Contract Slice turns loose implementation intent into AI-generated contracts, tests, and gates before coding.

## Workflow

Intent → Contract Discovery → Review → Tests/Gates → Implementation → Verification

## Core idea

Early specificity is often fake.

Instead of forcing a complete spec upfront, Contract Slice asks AI to discover the useful contracts:

- preconditions
- postconditions
- invariants
- edge cases
- failure modes
- test properties
- type expectations
- runtime validation points
- hard gates

Implementation starts only after the guardrails exist.

## Commands

- `/cslice.intent`
- `/cslice.contract`
- `/cslice.review`
- `/cslice.tests`
- `/cslice.implement`
- `/cslice.verify`
