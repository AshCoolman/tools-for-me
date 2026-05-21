---
description: Implement one Contract Slice inside the generated guardrails
---

Implement this Contract Slice using the intent, contract, review, and tests.

Rules:
- Minimal diff.
- Stay inside listed files unless impossible.
- Do not weaken tests.
- Do not weaken gates.
- Do not add dependencies unless explicitly approved.
- Do not introduce `any`, `ts-ignore`, skipped tests, or broad refactors.
- Preserve naming at external boundaries.
- Prefer runtime validation at trust boundaries.
- If the contract is wrong, stop and explain before changing it.

After implementation, report exactly:

# Implementation Result

## Files changed

## Contract points satisfied

## Tests expected to pass

## Deviations from contract

## Gates to run
