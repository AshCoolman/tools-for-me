# Quickstart — Leaf Allocation Simulator

How to use the simulator once it's built. Treat this as a smoke-test recipe for the maintainer.

## Prerequisites

- Node ≥ 20 (already an `engines` constraint).
- Inside the leaf-toolkit checkout. No external repo needed.
- No new dependencies to install.

## 1. Run the test suite

```sh
npx tsx --test 'tests/sim/**/*.test.ts'
```

Expected outcome on a clean tree:

- `refactor-regression.test.ts` passes (proves the `partition.ts` refactor did not change `leaves.gitignored.json`).
- `overlap.test.ts`, `drift.test.ts`, `allocate.test.ts`, `boundary.test.ts`, `mutations.test.ts`, `determinism.test.ts`, `visualise.test.ts`, `balance.test.ts`, `pathological.test.ts` all green.
- `baseline.test.ts` writes `specs/001-leaf-allocation-sim/baseline/*.txt`.

A red test on `refactor-regression.test.ts` is a stop-the-line signal: the production CLI has drifted from its golden snapshot.

## 2. Run a one-shot report against a built-in fixture

```sh
leaf sim report --fixture flat-30 --seed 42 --k 4 --strategy round-robin
```

Output is the human-readable summary block. Add `--json` for full machine-readable output.

## 3. Run a report against the host repo's real `src/`

```sh
leaf sim baseline
```

Writes `specs/001-leaf-allocation-sim/baseline/{overlap,drift-self,allocation-rr-k4,visualisation,metrics,summary}.txt`. The `summary.txt` contains either `clean` or `violations: <counts>`. Commit these to give the spec dir a real-world anchor.

## 4. Investigate a suspected partition weakness

The user's original suspicion: bin-N proliferation under small mutations. To reproduce a candidate:

```sh
leaf sim report \
  --fixture boundary-1500 \
  --seed 1 \
  --mutate grow:src/foo/big.ts:5 \
  --k 4 \
  --strategy round-robin \
  --json
```

Check the `drift.binsRenumbered` field. A non-empty entry there means a 5-LOC change shifted the bin layout — concrete evidence of the suspected weakness.

## 5. Detect agent collision under random allocation

```sh
leaf sim report \
  --fixture flat-30 \
  --seed 7 \
  --k 8 \
  --strategy random-uniform-rep \
  --json
```

Inspect `collisions.pairs`. With `k=8` and `random-uniform-rep` the matrix is expected to be non-empty; the report quantifies which file sets collide.

## 6. Read the visualisation in a terminal or markdown viewer

```sh
leaf sim report --fixture wide-shallow --seed 3 > /tmp/sim.txt
less /tmp/sim.txt
```

The visualisation block is markdown-fenced-code-block-safe, so pasting it into a follow-up issue or PR description preserves layout.

## 7. CI gate (optional)

```sh
leaf sim baseline || exit 1
```

Exit code `1` when `summary` is anything other than `clean`. Wire this into CI to catch silent regressions in the partition logic.

## Where to look in source

| Concern | File |
|---|---|
| Pure partition core | `src/sim/core/partition-core.ts` |
| FS → DirNode + mock DirNode | `src/sim/core/dirnode.ts` |
| Fixture shapes | `src/sim/fixtures.ts` |
| Mutation primitives | `src/sim/mutations.ts` |
| Overlap / drift / allocate / collide | `src/sim/{overlap,drift,allocate,collide}.ts` |
| Visualisation / balance | `src/sim/{visualise,balance}.ts` |
| Full-report orchestrator | `src/sim/report.ts` |
| Standalone CLI runner | `src/sim/cli.ts` |
| Refactored production verb | `src/commands/partition.ts` (IO shell only) |
| Golden snapshot for refactor regression | `tests/sim/__snapshots__/leaves.gitignored.json` |
