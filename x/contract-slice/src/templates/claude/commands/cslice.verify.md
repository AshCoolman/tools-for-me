---
description: Verify implementation against the Contract Slice contract and hard gates
---

Run gates and inspect the diff against the Contract Slice contract.

Check:
1. Typecheck
2. Unit tests
3. Type tests, if present
4. Property tests, if present
5. Lint
6. Build
7. Suspicious test weakening
8. Changed files outside scope
9. New `any`
10. New `ts-ignore`
11. Skipped tests
12. Lowered thresholds
13. Snapshot churn
14. Contract drift

Output exactly:

# Verification Result

## PASS/FAIL

## Commands run

## Failing checks

## Suspicious changes

## Contract drift

## Minimal fix

Rules:
- Do not hide failures.
- Do not claim success unless commands passed.
- Do not fix unless asked.
