---
domain: priority
leafPath: packages/foo/src/entity-view-lib
priority: high
priorityRank: 1
ratifiedBy: ashley
ratifiedAt: 2026-04-28
---

# Priority — `packages/foo/src/entity-view-lib`

Reason: load-bearing entity rendering used by every showcase feature; any
regression here is user-visible across the product.

The priority is durable. Coverage thresholds, refactor scope, and security
review cadence all derive from this field. Do not lower priority to dodge
work — split the leaf or accept the risk explicitly.
