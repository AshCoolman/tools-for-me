# Quickstart — Fix Partition Stability

How to run, validate, and migrate to the new partition algorithm. Treat this as the smoke-test recipe for the maintainer once the change has landed.

## Prerequisites

- Node ≥ 20 (existing `engines` constraint).
- Inside the leaf-toolkit checkout. No external repo needed.
- No new dependencies to install.
- Spec-001 simulator harness already in place (it is the validation surface).

## 1. Run the test suite

```sh
npx tsx --test 'tests/sim/**/*.test.ts'
```

Expected outcome on a clean tree after the algorithm change:

- `stability.test.ts` (US-1) passes — bin ids are stable under file-set-preserving mutations across at least 5 mutation classes × 2 fixtures.
- `balance-fix.test.ts` (US-2) passes — host repo's `src/` reports `verdict ∈ {well-balanced, skewed}` (`max/min ≤ 3`).
- `hysteresis.test.ts` (US-3) passes — the `boundary-1499 + grow:s1/f.ts:5` mutation produces a single subtree leaf in both runs.
- `migration.test.ts` (US-4) passes — rename / orphan / idempotent paths all green.
- `binid-collision.test.ts` passes — constructed collision case fails loudly per FR-014.
- `refactor-regression.test.ts` passes against the **regenerated** golden snapshot.
- All other spec-001 tests continue to pass.

A red `refactor-regression.test.ts` is a stop-the-line: either the algorithm changed in an unintended way, or the golden was not regenerated. Compare the live `leaves.gitignored.json` to the snapshot byte-for-byte to diagnose.

## 2. Regenerate the refactor-regression snapshot

This is required exactly once during this change. Reviewers must consciously accept the new snapshot.

```sh
UPDATE_SNAPSHOTS=1 npx tsx --test tests/sim/refactor-regression.test.ts
```

The test writes `tests/sim/__snapshots__/leaves.gitignored.json` (and the host-src fixture mirror under `tests/sim/__fixtures__/host-src-snapshot/`). The commit that lands this regen MUST mention the regen in its message:

```
Regenerate refactor-regression snapshot — partition algorithm intentionally changed (spec 002).
```

## 3. Run a stability check against a built-in fixture

The mutation that motivated this change:

```sh
leaf sim report \
  --fixture boundary-1499 \
  --seed 1 \
  --mutate grow:s1/f.ts:5 \
  --json
```

Expected after the fix (matches SC-001):

```json
{
  "drift": {
    "binsRenumbered": [],
    "leavesAdded": [],
    "leavesRemoved": [],
    "filesMovedLeaf": []
  }
}
```

Hysteresis keeps the directory as one subtree leaf; the committed `LEAF.priority.md` (no suffix) survives.

The bin-aware case (matches SC-002):

```sh
leaf sim report \
  --fixture boundary-1700 \
  --seed 1 \
  --mutate grow:s1/f.ts:5 \
  --json
```

Expected:

```json
{
  "drift": {
    "binsRenumbered": []
  }
}
```

— even though the partition has bins. The bin containing `s1/f.ts` keeps the same `binId` because its file set is unchanged.

## 4. Run the balance check against the host repo

```sh
leaf sim baseline
```

Expected (matches SC-003): `summary.txt` reads `Balance: well-balanced` or `Balance: skewed`. The pre-fix value was `unbalanced (LOC max/min = 8.28)`; post-fix should be ≤ 3.

If the post-fix ratio still exceeds 3, FR-007 is not met — see research §4 for the mitigation path (subtree-leaf merging) which is deferred unless this signal fires.

## 5. Migrate committed `LEAF.priority.bin-N.md` files

After the algorithm change lands, each consumer repo must run the migration once.

```sh
cd <consumer-repo>
leaf partition --migrate-bin-labels
```

Expected output: a printed `MigrationReport` listing renames, unchanged, and orphans (see `contracts/cli.md`). Inspect orphans manually — they represent bins whose membership changed enough that no clear successor exists. Reassign their priority by hand against the new `LEAF.priority.bin-<id>.md` files.

Re-running the command is safe:

```sh
leaf partition --migrate-bin-labels
# → renamed: 0, orphaned: 0
```

The first run does the work; the second run confirms idempotency.

For machine consumption (e.g. wiring into a release script):

```sh
leaf partition --migrate-bin-labels --json | jq '.renamed | length'
```

## 6. Verify on the leaf-toolkit's own repo

```sh
cd leaf-toolkit
leaf partition                    # regenerates leaves.gitignored.json with binId field
leaf partition --migrate-bin-labels  # if any LEAF.priority.bin-N.md exist, migrate them
leaf sim baseline                 # confirm balance verdict
git diff leaves.gitignored.json   # inspect — additive binId field per bin leaf
```

The leaf-toolkit's own `src/` is the canonical fixture for the refactor-regression snapshot, so ensuring `leaf partition` is clean here is the load-bearing self-test.

## Where to look in source

| Concern | File |
|---|---|
| Algorithm (hysteresis + LPT + binId hashing) | `src/sim/core/partition-core.ts` |
| Prior-bin-dir lookup (FS-side) | `src/sim/core/prior-state.ts` |
| Migration command body | `src/commands/partition.ts` (under `--migrate-bin-labels` branch) |
| Filename-suffix updates | `src/commands/{partition,priority,status,scope-from-priority,link}.ts`, `src/doc/parser.ts` |
| Drift bin-identity comparison | `src/sim/drift.ts` |
| Visualisation legend | `src/sim/visualise.ts` |
| Type extensions | `src/sim/types.ts` (and re-export `src/types.ts`) |
| Tests | `tests/sim/{stability,balance-fix,hysteresis,migration,binid-collision}.test.ts` |
| Regenerated golden | `tests/sim/__snapshots__/leaves.gitignored.json` |

## Smoke flow (~ 2 minutes)

```sh
# 1. Build / install
npm install --ignore-scripts

# 2. Run the harness
npx tsx --test 'tests/sim/**/*.test.ts'

# 3. Self-partition the toolkit
node --import tsx ./src/cli.ts partition

# 4. Confirm balance and stability
node --import tsx ./src/cli.ts sim baseline
cat specs/001-leaf-allocation-sim/baseline/summary.txt   # → expect "clean"
```

If all four steps pass, the change is shippable.
