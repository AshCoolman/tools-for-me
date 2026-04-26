---
domain: coverage
leafPath: packages/foo/src/entity-view-lib
generatedAt: 2026-04-29T08:00:00Z
metric: vitest
target: 95
status:
  lines: 93.96
  branches: 96.71
  funcs: 98.21
  stmts: 93.96
---

# Coverage — `packages/foo/src/entity-view-lib`

## Files
- packages/foo/src/entity-view-lib/Entity.tsx
- packages/foo/src/entity-view-lib/EntityView.tsx
- packages/foo/src/entity-view-lib/useChartData.ts

## Status
Branches and funcs above target. Lines/stmts 1% short.

## Blockers
- `TimeAxis.tsx:82-93` — dead helper `yToIdx` (declared, never called). Caps
  per-file coverage at 93%. Recommend deletion before next coverage pass.
