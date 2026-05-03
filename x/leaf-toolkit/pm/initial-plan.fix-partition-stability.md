# Initial plan — fix partition stability

**Status**: pre-spec. Feeds into `/speckit-specify`.
**Date**: 2026-05-03
**Predecessor**: `specs/001-leaf-allocation-sim/` (the harness that measured the problems below).

## Problem

The leaf-allocation simulator surfaced two concrete weaknesses in `partitionTree`. Both are reproducible from a fixture and a seed, captured under `specs/001-leaf-allocation-sim/baseline/`.

### Problem A — bin labels are unstable under small mutations

`leaf sim report --fixture boundary-1499 --seed 1 --mutate grow:s1/f.ts:5 --json` produces:

```
runs: 2
drift.binsRenumbered: 1
leavesAdded: [" bin-1", " bin-2"]
leavesRemoved: [""]
```

A 5-LOC growth across `SPLIT_AT=1500` flips a single subtree leaf into two bin leaves. **Any committed `LEAF.priority.bin-N.md` for the predecessor leaf is silently invalidated** — its bin index doesn't exist in the new partition. This is the user's load-bearing concern: priority decisions baked into filenames don't survive boundary crossings.

The same problem applies for in-place renumbering: bin contents shift when an unrelated item changes size, because FFD bin packing is sort-by-size first then greedily assign.

### Problem B — leaves are heavily imbalanced

`leaf sim baseline` against this repo's own `src/` reports:

```
Balance: unbalanced (LOC max/min = 8.28)
```

Three leaves: 1499 LOC, 1487 LOC, 181 LOC. The 181-LOC leaf carries the same scaffolding cost (`LEAF.partition.md`, `LEAF.audit.md`, agent dispatch overhead) as the 1499-LOC leaves but represents 5× less work. Round-robin allocation thus over-assigns small leaves at parity with large ones.

## Goals

1. **Bin labels stable under mutations that don't change item identity.** Adding 5 LOC to one file inside a bin must not change the bin's identifier.
2. **Bin labels survive the threshold crossing**, where it's safe to do so. When a leaf splits into bins because its parent crossed `SPLIT_AT`, the dominant bin's identifier should be derivable so its `LEAF.priority.bin-N.md` continues to attach.
3. **Leaves balanced within a stated tolerance** (target: max/min ≤ 3, ideally ≤ 1.5 for the well-balanced verdict).
4. **No regression on safety**: zero file overlap, zero intra-leaf duplicates (FR-003/FR-004 from the simulator spec must continue to pass).
5. **Backwards-compatible enough**: existing committed `LEAF.priority.bin-1.md` etc. should survive a re-partition wherever the underlying content is unchanged.

## Non-goals

- Replacing the `Leaf` data shape. Adding a field is fine; restructuring isn't.
- Solving rename/move stability — those are file-identity problems, not bin-labelling problems.
- Tuning `TARGET_LOC` or `SPLIT_AT` constants. Hysteresis is in scope; constant changes are not.

## Candidate approaches

### A. Content-addressed bin labels (recommended)

Replace the integer `binIndex` with a short stable hash of the bin's file set (e.g., 6-char hex of sha256 over sorted file paths). The `Leaf.binIndex` field becomes `binId: string`; the on-disk doc becomes `LEAF.priority.bin-<hash>.md`.

**Why**: a bin's identity is `{ files }`, not `{ position in FFD output }`. Hash makes that explicit. A 5-LOC mutation that keeps the same files in the same bin yields the same hash. A mutation that re-packs files across bins yields different hashes — which is correct: the partition genuinely changed.

**Cost**: opaque labels. `bin-3a7f2c` is harder to read than `bin-1`. Mitigation: keep a `binIndex` alongside as a sort key for legibility, but route doc filenames through `binId`.

**Migration**: existing `LEAF.priority.bin-N.md` files need a one-time rename to `LEAF.priority.bin-<hash>.md`. A `leaf priority migrate-bin-labels` shim can do this.

### B. Sort-stable FFD (cheaper, weaker)

Sort bin-packing inputs alphabetically by `label` before applying FFD, instead of `loc` descending. Two re-runs over identical inputs produce identical bins; small LOC mutations to one item don't change the sort order so don't reshuffle bin assignment.

**Why**: solves Problem A within a single bin's stable membership, with no schema change.

**Cost**: worse pack quality (FFD is empirically near-optimal because of the size-desc sort). Imbalance gets worse, not better — Problem B regresses.

### C. Sticky bins via committed-state lookup

On re-partition, read existing `LEAF.priority.bin-*.md` filenames in the target dir; for each existing bin, prefer to keep its file set together if possible. Only emit fresh bin labels for files that don't have a prior home.

**Why**: maximally backwards-compatible.

**Cost**: stateful partitioner. Behaviour depends on what's in the working tree, which makes the algorithm hard to reason about and test. Conflicts with FR-005 (deterministic given inputs).

### D. Hysteresis at SPLIT_AT

Only enter bin-packing when `subtreeLoc > SPLIT_AT * (1 + h)` (e.g., `h = 0.05` → 1575). Once in bin mode, stay there until `subtreeLoc < SPLIT_AT * (1 - h)` (1425).

**Why**: a 5-LOC growth at 1499 stays as one subtree until 1576, well past the original boundary. The committed `LEAF.priority.md` (no bin suffix) survives.

**Cost**: doesn't help once bins exist; doesn't fix Problem B.

### E. Balanced bin packing (for Problem B)

Replace FFD with a number-partitioning algorithm targeting equal `loc` per bin (LPT, multifit, or simple two-pass: estimate `binCount = ceil(total / TARGET_LOC)`, then distribute by descending size). Bins emerge with `loc` values within ~1.5× of each other rather than the current "fill to SPLIT_AT, spill the rest into one final tiny bin."

**Why**: directly addresses the 8.28× imbalance.

**Cost**: changes algorithm output. The refactor-regression test (T009) snapshot needs regenerating — that's expected for an algorithm fix and the harness can take the new snapshot, but reviewers must consciously accept the change.

## Recommended approach

**A + D + E, applied in that priority order.**

- **A** is the load-bearing fix for Problem A. Without it, Problem A keeps recurring whenever an item moves bins.
- **D** is a small additional improvement that lets the fully-stable case (single subtree leaf) tolerate small mutations. Cheap to implement (one constant), gives a visible win.
- **E** addresses Problem B independently. Doing it in the same change is appropriate: both fixes need a snapshot regeneration anyway.

Skip B (subsumed by A) and C (state-dependent; bad fit for the toolkit's character).

## Acceptance criteria

All measurable via the simulator harness:

1. `sim report --fixture boundary-1499 --mutate grow:s1/f.ts:5` produces `drift.binsRenumbered = 0` AND `drift.leavesAdded = []` AND `drift.leavesRemoved = []`. (Hysteresis from D keeps it as one subtree.)
2. `sim report --fixture boundary-1700 --mutate grow:s1/f.ts:5` produces `drift.binsRenumbered = 0` even though the partition has bins, because the same files are in the same bins (bin labels are content-derived).
3. `sim baseline` against this repo's `src/` reports `verdict ∈ {well-balanced, skewed}` (i.e., `max/min ≤ 3`).
4. `sim report` for any fixture × strategy reports `overlap.overlapCount = 0` and `intraLeafDuplicates = []`.
5. The bin-stability cases above hold across at least 5 representative mutation classes (addFile, growFile, shrinkFile, removeFile, renameFile-within-leaf).

## Migration story

`LEAF.priority.bin-1.md` → `LEAF.priority.bin-<hash>.md`. One of:

- One-shot: `leaf partition --migrate-bin-labels` walks the repo, computes new hashes, renames files, and emits a short report. Run once after the algorithm fix lands.
- Lazy: `leaf priority` writes new-format files going forward; a `leaf status` warning surfaces orphaned old-format files until the user resolves them.

The first is simpler. Pick it unless the migration matrix is more painful than expected.

## Open questions for `/speckit-specify`

1. **Hash length**: 6 hex chars (24 bits, ~16M space)? Long enough to avoid practical collisions in a single repo's bin set; short enough to read. Or go to 8 to be safer?
2. **Hysteresis margin**: 5%? 10%? Larger = more stability, but also more "leaves above TARGET_LOC" which the user might find surprising.
3. **Balanced packing target**: aim for `max/min ≤ 1.5` (well-balanced) or `≤ 3` (skewed)? Tighter target rejects more partitions and may force more re-bins.
4. **Migration is in scope?** If yes, this is a 2-spec project: spec 002 (algorithm) + spec 003 (migration tool). If no, the algorithm change ships with a manual rename instruction.
5. **Does the production CLI keep `binIndex` for legibility, or drop it entirely in favour of the hash?**

## Out of scope (deferred)

- Survey / coverage / link command updates. They consume `leaves.gitignored.json`; if `binId` replaces `binIndex` they need a one-line update each, but that's mechanical and belongs in the implementation phase, not the spec.
- Algorithm parameterisation (`TARGET_LOC`, `SPLIT_AT` as flags). The harness already takes them from `partition-core.ts`; flag-ifying them is a separate concern.
- Changing how `priority`, `audit` etc. doc files are named. Only `partition` and `priority` use the bin suffix today; both need updating.
