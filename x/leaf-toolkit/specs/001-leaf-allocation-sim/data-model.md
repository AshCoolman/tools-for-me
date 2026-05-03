# Phase 1 Data Model — Leaf Allocation Simulator

The simulator's entities, their fields, and relationships. All shapes are plain TypeScript interfaces — no classes, no inheritance, no derived state held in instances. The canonical types live in [contracts/types.ts](contracts/types.ts); this document explains them.

## Core (existing — unchanged)

These come from `src/commands/partition.ts` today and survive the refactor verbatim. The simulator depends on their shape, not on their location.

### `FileNode`
| Field | Type | Notes |
|---|---|---|
| `path` | `string` | Absolute path. In a synthetic fixture, the prefix is `"/mock"` (or any caller-supplied base). |
| `loc` | `number` | Lines of code. Integer ≥ 0. In production, computed by `countLoc()`; in fixtures, set explicitly by the builder. |

### `DirNode`
| Field | Type | Notes |
|---|---|---|
| `path` | `string` | Absolute path. |
| `files` | `FileNode[]` | Direct files under this directory. |
| `dirs` | `DirNode[]` | Direct sub-directories (already filtered by `isExcludedDir`). |
| `fileLoc` | `number` | `sum(files[].loc)`. |
| `subtreeLoc` | `number` | `fileLoc + sum(dirs[].subtreeLoc)`. |
| `allFiles` | `FileNode[]` | Recursive flatten. Must equal `files ++ dirs.flatMap(d => d.allFiles)`. |

**Invariants**: `subtreeLoc ≥ fileLoc`. `allFiles.length === files.length + sum(dirs[].allFiles.length)`. The fixture builder produces `DirNode` instances that satisfy these without callers having to compute them.

### `Leaf`
| Field | Type | Notes |
|---|---|---|
| `path` | `string` | Repo-relative path, e.g. `"src/foo"`. |
| `scope` | `"subtree" \| "bin"` | Subtree leaves cover the full directory; bin leaves cover a subset of siblings. |
| `binIndex` | `number?` | Present only when `scope === "bin"` and `binTotal > 1`. 1-indexed. |
| `binTotal` | `number?` | Present only when `scope === "bin"`. |
| `members` | `string[]?` | Present only when `binTotal > 1`. Bin item labels (sub-dir paths or `"<dir>/  (direct files)"`). |
| `files` | `string[]` | Repo-relative file paths owned by this leaf. |
| `loc` | `number` | Sum of LOC across `files`. |

**Identity**: `(path, binIndex)`. Two leaves with the same path and different `binIndex` are distinct; two leaves with the same path and `binIndex === undefined` are duplicates (a bug).

## Simulator (new)

### `FixtureSpec`
Declarative input to the fixture builder.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable name, e.g. `"flat-30"`, `"deep-narrow"`, `"boundary-exact-1500"`. Used in report filenames. |
| `seed` | `number` | Drives all random choices in the builder. |
| `shape` | `FixtureShape` | One of `"flat"`, `"deep"`, `"wide"`, `"boundary"`, `"custom"`. |
| `params` | `Record<string, unknown>` | Shape-specific knobs (file count, depth, fanout, target LOC distribution, etc.). |

The four named shapes are documented in [contracts/types.ts](contracts/types.ts) and each accepts a different `params` object.

### `FixtureBuild`
The output of building a fixture.

| Field | Type | Notes |
|---|---|---|
| `spec` | `FixtureSpec` | Echoed back for traceability. |
| `repoBase` | `string` | The synthetic repo root, e.g. `"/mock"`. |
| `root` | `DirNode` | The root `DirNode` ready to feed `partitionTree`. |

### `PartitionRun`
A single partition invocation against a `FixtureBuild` (or real FS root).

| Field | Type | Notes |
|---|---|---|
| `runId` | `string` | Caller-supplied id, e.g. `"T0"`, `"T1-after-grow"`. |
| `fixtureId` | `string` | From `FixtureSpec.id`. Empty for real-FS runs. |
| `seed` | `number` | Mirrors the fixture seed. |
| `leaves` | `Leaf[]` | Output of `partitionTree`. |
| `totalLoc` | `number` | Sum of `leaves[].loc`. |
| `totalFiles` | `number` | Sum of `leaves[].files.length`. |
| `generatedAt` | `string` | ISO timestamp. **Excluded from determinism checks.** |

### `OverlapReport`
Output of `checkOverlap(leaves)`.

| Field | Type | Notes |
|---|---|---|
| `overlapCount` | `number` | Number of distinct file paths that appear in ≥ 2 leaves. |
| `overlaps` | `Array<{ file: string; leaves: string[] }>` | Per-file detail. `leaves[]` is the list of leaf identities (`"path"` or `"path bin-N"`) that claim the file. Empty when clean. |
| `intraLeafDuplicates` | `Array<{ leaf: string; file: string }>` | Files appearing twice within a single leaf's `files[]` (corruption signal — scenario 7). |

**Invariant**: `overlapCount === overlaps.length`. `overlapCount === 0 ∧ intraLeafDuplicates.length === 0` ⟺ partition is safe.

### `DriftReport`
Output of `diffRuns(prev, curr)`.

| Field | Type | Notes |
|---|---|---|
| `filesAdded` | `Array<{ file: string; toLeaf: string }>` |
| `filesRemoved` | `Array<{ file: string; fromLeaf: string }>` |
| `filesMovedLeaf` | `Array<{ file: string; fromLeaf: string; toLeaf: string }>` |
| `filesRenamed` | `Array<{ fromPath: string; toPath: string; leaf: string }>` | Same leaf, different path — heuristic match by leaf membership + LOC. |
| `binsRenumbered` | `Array<{ path: string; before: BinSnapshot[]; after: BinSnapshot[] }>` | Same parent path, different bin file-sets. |
| `leavesAdded` | `string[]` | Leaf identities new in `curr`. |
| `leavesRemoved` | `string[]` | Leaf identities absent in `curr`. |

`BinSnapshot = { binIndex: number; files: string[] }`.

**Invariant**: a file appears in **exactly one** of `filesAdded`, `filesRemoved`, `filesMovedLeaf`, `filesRenamed`, or none. Never multiple categories.

### `Allocation`
Output of `allocate(leaves, k, strategy, seed)`.

| Field | Type | Notes |
|---|---|---|
| `strategy` | `"round-robin" \| "random-uniform" \| "random-uniform-rep" \| "priority-weighted"` | |
| `seed` | `number` | Echoed for reproducibility. |
| `k` | `number` | Number of agents. |
| `assignments` | `Array<{ agentId: number; leafIds: string[] }>` | Length === `k`. `agentId` is `0..k-1`. |

For `priority-weighted`, the caller must supply a `priorityOf` function as an extra argument; this is not stored on the `Allocation` record (it is not data, it is the input distribution).

### `CollisionMatrix`
Output of `collisionMatrix(allocation, leaves)`.

| Field | Type | Notes |
|---|---|---|
| `pairs` | `Array<{ agentA: number; agentB: number; sharedLeaves: string[]; sharedFiles: string[] }>` | Empty for non-replacement strategies on `k ≤ leaves.length`. |
| `agentLoad` | `Array<{ agentId: number; leafCount: number; fileCount: number; totalLoc: number }>` | Per-agent workload summary, useful alongside collisions. |

**Invariant**: `sharedFiles ⊇ flatten(leaves(sharedLeaves).files)` minus duplicates.

### `BalanceReport`
Output of `balanceMetrics(leaves)`.

| Field | Type | Notes |
|---|---|---|
| `leafCount` | `number` |
| `totalLoc` | `number` |
| `totalFiles` | `number` |
| `loc` | `Stats` | `{ mean, stddev, min, max, maxOverMin }`. `maxOverMin` is `null` when `min === 0`. |
| `files` | `Stats` | Same shape over per-leaf file counts. |
| `verdict` | `"well-balanced" \| "skewed" \| "unbalanced" \| "n/a"` | Cited threshold: `well-balanced` when `loc.maxOverMin ≤ 1.5`, `skewed` when `≤ 3`, `unbalanced` otherwise, `n/a` when `leafCount ≤ 1`. |

`Stats = { mean: number; stddev: number; min: number; max: number; maxOverMin: number | null }`.

### `SimReport`
The full-report orchestrator's output (one object per `report()` call).

| Field | Type |
|---|---|
| `runs` | `PartitionRun[]` (length 1 or 2 depending on whether a mutation was applied) |
| `overlap` | `OverlapReport` |
| `drift` | `DriftReport \| null` (null when only one run) |
| `allocation` | `Allocation` |
| `collisions` | `CollisionMatrix` |
| `visualisation` | `string` (ASCII) |
| `balance` | `BalanceReport` |
| `summary` | `string` (one-line verdict — "clean" or "violations: ..." with counts) |

## State transitions

There are no stateful entities. Every function in the simulator is a pure transform:

```
FixtureSpec
   │ build()
   ▼
FixtureBuild  ──────────────► DirNode  ──── partitionTree() ────► Leaf[]
   │                          │                                       │
   │ mutate()                 │                                       ├── checkOverlap()    → OverlapReport
   ▼                          │                                       ├── allocate()         → Allocation
FixtureBuild' (mutated)       │                                       ├── balanceMetrics()   → BalanceReport
   │ partitionTree()                                                  └── visualise(root, …) → string
   ▼
Leaf[]'   (post-mutation)

(Leaf[], Leaf[]')  ── diffRuns() ────► DriftReport
(Allocation, Leaf[]) ── collisionMatrix() ────► CollisionMatrix
```

Mutation primitives operate on `FixtureBuild` (specifically its `root: DirNode`) and return a new `FixtureBuild` — the original is untouched. This preserves referential transparency for tests that compare pre- and post-mutation state.

## Validation rules

| Rule | Where enforced |
|---|---|
| `Leaf.files` are unique within one leaf | `checkOverlap` returns `intraLeafDuplicates` |
| `Leaf.files` are pairwise disjoint across leaves of one run | `checkOverlap.overlapCount === 0` |
| `FileNode.loc ≥ 0` | Mutation primitives clamp at 0 (scenario 76) |
| `DirNode.subtreeLoc` matches recursive sum | `dirnode.ts` builders compute it; tests assert it |
| Two runs with same input produce same `Leaf[]` (modulo `generatedAt`) | `determinism.test.ts` |
| `partitionTree(buildFromFs(src/)) === leaves.gitignored.json` snapshot | `refactor-regression.test.ts` |

## Out of scope

- Persistence (sim is in-process; only the `baseline/` artifacts touch disk).
- Concurrency (no parallel partitioning; single-threaded by design).
- Real agent execution (the simulator models *allocation*, not work).
- Algorithm changes (FR-014).
