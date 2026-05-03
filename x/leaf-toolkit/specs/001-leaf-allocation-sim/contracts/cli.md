# CLI Contract — `leaf sim`

The simulator ships as both a test suite (`tsx --test 'tests/sim/**/*.test.ts'`) and a standalone CLI (`leaf sim …`) for ad-hoc investigation. This document fixes the CLI surface.

## Verb dispatch

`src/cli.ts` gains one new verb: `sim`. The existing verbs (`partition`, `priority`, `survey`, `link`, `status`, `scope-from-priority`, `safe-tool`, `safe-vitest`, `domain`) are unchanged.

```sh
leaf sim <subcommand> [flags]
```

## Subcommands

### `leaf sim report`

Run the full report pipeline against one fixture (or against the host repo's real `src/`) and print a `SimReport` summary to stdout. Optionally writes the per-section artifacts under a target directory.

**Flags**:

| Flag | Type | Default | Notes |
|---|---|---|---|
| `--fixture <id>` | string | `"flat-30"` | One of the named built-in fixtures, or `"real"` for the host repo's `src/`. |
| `--seed <n>` | int | `42` | Seeds fixture build and allocation. |
| `--mutate <op>` | string | (none) | Mutation to apply between runs. Format: `add:<path>:<loc>` / `grow:<path>:<delta>` / `remove:<path>` / `rename:<from>:<to>` / `move:<path>:<toDir>`. May be repeated; applied in order. |
| `--k <n>` | int | `4` | Number of agents in the allocation. |
| `--strategy <s>` | enum | `"round-robin"` | One of `round-robin`, `random-uniform`, `random-uniform-rep`, `priority-weighted`. |
| `--out <dir>` | path | (none) | If set, write each section to its own file (`overlap.txt`, `drift.txt`, `allocation.txt`, `visualisation.txt`, `metrics.txt`, `summary.txt`). |
| `--json` | bool | `false` | Print the full `SimReport` as JSON instead of the formatted summary. |

**Stdout (default)**:

```
=== Sim Report ─ fixture=flat-30 seed=42 mutation=none ===
Runs        : 1
Leaves      : 7      Files: 30      LOC: 720
Overlap     : 0      (safe)
Drift       : (n/a — single run)
Allocation  : round-robin k=4
Collisions  : 0 pairs
Balance     : well-balanced (LOC max/min = 1.32)
Summary     : clean
```

**Exit code**: `0` if `summary === "clean"`, `1` otherwise. CI can use this to gate on partition safety.

### `leaf sim baseline`

Run the full report against the host repo's real `src/` with `--fixture real --strategy round-robin --k 4 --out specs/001-leaf-allocation-sim/baseline/`. Equivalent to a preset `report` invocation; exists so scenario 100's invocation has a stable name.

**Stdout**:

```
Wrote baseline to specs/001-leaf-allocation-sim/baseline/
  overlap.txt
  drift-self.txt
  allocation-rr-k4.txt
  visualisation.txt
  metrics.txt
  summary.txt
Summary: <clean | violations: ...>
```

**Exit code**: same as `report`.

### `leaf sim list-fixtures`

Print the names and descriptions of the built-in fixtures.

```
flat-30      30 small files in one directory, total LOC ~ 720
deep-narrow  depth-8 tree, 1 file per level, ~ 200 LOC total
wide-shallow fanout-12, one oversize child to force bins
boundary-1500 one directory at exact SPLIT_AT
real         the host repo's src/ (no synthetic build)
```

**Exit code**: `0`.

## Determinism contract

For any fixed `(--fixture, --seed, --mutate, --k, --strategy)` tuple, `leaf sim report --json` produces byte-identical output across runs (excluding `PartitionRun.generatedAt`, which is `"DETERMINISTIC"` literal in `--json` output to keep diffs clean).

## Out of scope for this CLI

- No `--watch` mode.
- No coloured terminal output (markdown-paste-friendly always).
- No remote execution / serialisation beyond `--json`.
- No agent execution — `leaf sim` reports allocations, it does not run them.
