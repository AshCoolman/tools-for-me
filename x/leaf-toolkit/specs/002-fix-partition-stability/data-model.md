# Phase 1 Data Model — Fix Partition Stability

The type changes are additive on top of spec 001's data model. Three shapes change: `Leaf` gains a field, `BinSnapshot` (in `DriftReport`) updates its identity key, and a new `MigrationReport` entity is added. No rename / removal — old field semantics are preserved where possible.

## Modified entities

### `Leaf` (modified — additive)

Spec 001 shape: `{ path, scope, binIndex?, binTotal?, members?, files[], loc }`.
Spec 002 adds:

| Field | Type | Notes |
|---|---|---|
| `binId` | `string?` | Present iff `scope === "bin"` and `binTotal > 1`. 6 hex chars (sha256 prefix over sorted file paths). Identity key for cross-run continuity. |
| `binIndex` | `number?` | **Retained, semantics narrowed.** Sort/legibility aid only. NOT load-bearing for cross-run identity. May change run-to-run. |
| `binTotal` | `number?` | Unchanged. |
| `members` | `string[]?` | Unchanged. |

**Identity** (new): `(path, binId)`. Two leaves with the same `path` and equal `binId` represent the same logical bin across runs. Two leaves with the same `path` and `binId === undefined` are duplicates only if both lack a bin scope (one logical subtree leaf).

**Determinism invariant**: for identical `(DirNode, repoBase, priorBinDirs)` inputs, `Leaf[]` (modulo `generatedAt` on the manifest envelope) is byte-identical.

### `BinSnapshot` (modified)

Spec 001: `{ binIndex: number, files: string[] }`.
Spec 002: `{ binId: string, binIndex: number, files: string[] }` — `binId` joins as the load-bearing key for `DriftReport.binsRenumbered`. `binIndex` remains for human readability of the diff.

### `DriftReport.binsRenumbered` (semantics modified)

Spec 001 detected "same parent path, different file set under the same `bin-N` label". Spec 002's drift detector uses the new identity:

- A bin in `prev` is matched to a bin in `curr` by `(path, binId)` first.
- If matched, no entry is emitted (the bin is unchanged).
- If `prev` has a bin with `binId X` that has no match in `curr` *and* `curr` has a bin with the same `path` but different `binId Y`, the entry is emitted as `{ path, before: [old snapshot], after: [new snapshot] }`. This captures the case where files moved across bins.

The contract surface stays the same; the *input to the drift comparison* is `binId`, not `binIndex`. Tests that previously asserted `drift.binsRenumbered = 0` because `binIndex` matched must continue to pass — but they pass for the right reason now (file sets are unchanged), not because `binIndex` is sticky.

## New entities

### `PartitionOptions`

The third (optional) parameter to `partitionTree`:

```ts
export interface PartitionOptions {
  priorBinDirs?: ReadonlySet<string>;
}
```

| Field | Type | Notes |
|---|---|---|
| `priorBinDirs` | `ReadonlySet<string>?` | Repo-relative dir paths previously emitted as `scope === "bin"`. When absent or empty, FR-005 default applies: directories inside the hysteresis band emit a single subtree leaf. |

Backwards compatibility: omitting the parameter (the spec-001 call shape) is equivalent to `{ priorBinDirs: new Set() }`. No call sites break.

### `MigrationReport`

Output of `leaf partition --migrate-bin-labels`. Suitable for inclusion in commit messages or PR bodies.

| Field | Type | Notes |
|---|---|---|
| `renamed` | `Array<{ oldName: string, newName: string, leafPath: string, domain: string }>` | One entry per rename. `oldName`/`newName` are basenames; `leafPath` is repo-relative; `domain` is the doc kind (`partition`, `priority`, `audit`, etc.). |
| `unchanged` | `Array<{ name: string, leafPath: string, reason: "already migrated" \| "same hash" }>` | Files whose new id equals the old id (or whose name was already in `bin-<hash>` form and matches the new id). |
| `orphaned` | `Array<{ name: string, leafPath: string, reason: string }>` | Files whose old bin no longer maps to any new leaf. NOT deleted; left in place. `reason` strings: `"no matching bin in new partition"`, `"ambiguous match"`. |

**Invariant**: `renamed.length + unchanged.length + orphaned.length === <count of LEAF.*.bin-*.md files found>`. Every input file accounted for.

**Idempotency invariant**: `migrate(migrate(repo)).renamed.length === 0` and `.orphaned.length === 0`. The second run's `unchanged` list equals the union of the first run's `renamed` (now in their new names) and `unchanged`.

### `LeafIdentity` (helper, not persisted)

A string used as a map key in drift comparisons:

```ts
function leafIdentity(leaf: Leaf): string {
  return leaf.scope === "bin" && leaf.binId
    ? `${leaf.path}#${leaf.binId}`
    : leaf.path;
}
```

Replaces the spec-001 helper that used `binIndex`. The `#` separator distinguishes path-vs-id segments unambiguously.

## State transitions

`partitionTree` remains pure. State now flows in via `PartitionOptions.priorBinDirs`:

```
DirNode + repoBase + priorBinDirs
   │
   │   partitionTree()
   ▼
Leaf[]  (with binId on bins; binIndex retained for sort)
   │
   │   diffRuns(prev, curr) — uses binId for bin identity
   ▼
DriftReport
```

The migration command introduces a new flow alongside the partition pipeline:

```
repoBase
   │
   ├── readPriorBinDirsFromFs(repoBase, candidateDirs) ─► priorBinDirs
   │
   ├── partitionTree(buildFromFs(root), repoBase, { priorBinDirs }) ─► newLeaves
   │
   ├── readJson(leaves.gitignored.json, optional) ─► priorLeaves (optional oracle)
   │
   ├── walk LEAF.<domain>.bin-*.md files ─► onDiskBinDocs
   │
   ▼
matchOnDiskToNew(onDiskBinDocs, priorLeaves, newLeaves)
   │
   ▼
{ rename, unchanged, orphaned } actions
   │
   │   apply renames via fs.renameSync
   ▼
MigrationReport (stdout / --json)
```

## Validation rules

| Rule | Where enforced |
|---|---|
| `Leaf.binId` present iff `scope === "bin" ∧ binTotal > 1` | `partition-core.ts` emit; tests in `tests/sim/stability.test.ts` |
| Two partitions over identical inputs produce identical `binId` per bin | `tests/sim/stability.test.ts` (determinism check) |
| Two partitions whose bins differ in member set produce different `binId` | `tests/sim/stability.test.ts` (file-set sensitivity) |
| `binId` collisions within one partition fail loudly | `tests/sim/binid-collision.test.ts` |
| Files with `loc === 0` ARE included in `computeBinId` input — adding or removing a 0-LOC file changes the bin's `binId` | `partition-core.ts` (no filtering before hash); tested via `tests/sim/stability.test.ts` `addFile:loc=0` matrix point |
| Hysteresis: dir at subtreeLoc=1499 with no prior state → subtree leaf | `tests/sim/hysteresis.test.ts` |
| Hysteresis: dir at subtreeLoc=1480 with prior bin state → bin leaves | `tests/sim/hysteresis.test.ts` |
| LPT pack: all bins within 1.5× of mean for typical inputs | `tests/sim/balance-fix.test.ts` |
| Per-leaf max/min ≤ 3 on host repo's `src/` | `tests/sim/balance-fix.test.ts` (calls `sim baseline`) |
| Migration is idempotent | `tests/sim/migration.test.ts` |
| Migration reports orphans when bin no longer exists | `tests/sim/migration.test.ts` |
| `partitionTree(buildFromFs(src/)) === <regenerated golden>` | `tests/sim/refactor-regression.test.ts` (snapshot regenerated for this spec) |

## Changes to existing tests

- `tests/sim/refactor-regression.test.ts` — snapshot regenerated. Commit message must call out the regen.
- `tests/sim/boundary.test.ts` — pre-existing scenarios re-asserted under hysteresis. The 1499 + grow:5 case flips from "two bin leaves" to "one subtree leaf"; assertion text updates.
- `tests/sim/drift.test.ts` — assertions on `binsRenumbered` switch from `binIndex`-shifted to `binId`-divergent. Same shape, different identity key.
- `tests/sim/overlap.test.ts` — `leafIdentity` helper switches; the test inputs are explicit-shape `Leaf` objects so the test stays valid by mechanical update.
- `tests/sim/__fixtures__/host-src-snapshot/` — regenerated alongside the golden manifest. (These are copies of `src/*.ts` from when the spec-001 refactor-regression test was authored; they regenerate naturally as part of the snapshot bless.)

## Out of scope

- Changing the `LEAF.<domain>.md` markdown body shape. Only the filename suffix changes.
- Migration covers `LEAF.priority.bin-*.md` and `LEAF.audit.bin-*.md` (both are user-edited / agent-edited and preserved across runs per the existing `!existsSync` guard). `LEAF.partition.bin-*.md` is regenerated each run; its old filename is left orphaned on disk after the first post-upgrade `leaf partition` run, but the migration command also sweeps it incidentally for tidiness. Spec FR-009 was updated to this scope on 2026-05-03.
- Cross-spec back-compat shims. `leaves.gitignored.json` gains `binId` per bin leaf; downstream consumers update in lockstep with the algorithm change (single PR / single `leaf partition` regenerates the manifest).
- Changing `TARGET_LOC` / `SPLIT_AT` constants.
- Algorithm parameterisation as flags.
