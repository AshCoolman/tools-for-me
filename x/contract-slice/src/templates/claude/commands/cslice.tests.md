---
description: Generate tests from the Contract Slice contract
---

Generate or update tests from the Contract Slice contract.

Rules:
- Change tests only.
- Do not change production code.
- Do not weaken existing tests.
- Do not skip tests.
- Do not use `.only`.
- Add example tests first.
- Add property-based tests when input space is broad.
- Add type-level tests for public TypeScript APIs.
- Add runtime validation tests at trust boundaries.
- Stop and report if the contract contradicts existing implementation.

Output exactly:

# Contract Tests

## Files changed

## Example tests added

## Property tests added

## Type tests added

## Runtime validation tests added

## Contract conflicts
