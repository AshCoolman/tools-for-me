# Phase 0 Research — Leaf Allocation Simulator

Resolves all open questions before Phase 1 design. Six decisions, all framed as Decision / Rationale / Alternatives.

## 1. Test runner: `node:test` over vitest

**Decision**: Use Node's built-in `node:test` + `node:assert/strict` invoked via `tsx --test 'tests/**/*.test.ts'`.

**Rationale**:
- The leaf-toolkit ships zero test deps today. `package.json` has only three runtime deps (`tsx`, `@inquirer/prompts`, `yaml`) and zero devDeps. Adding vitest (~30+ transitive packages) for an internal harness contradicts the toolkit's character.
- Node ≥20 is already the engines floor. `node:test` lands as built-in there.
- `tsx` (already installed) loads TS files for `--test`.
- The harness asserts equality on plain objects, strings, and small JSON; vitest's snapshot/UI features are not needed.

**Alternatives considered**:
- **vitest**: rich features but a fat dep tree. Rejected — overshoots the need. The spec's Assumption "test runner is vitest" was an informed guess; this research overrides it with a more aligned choice.
- **jest**: same dep-weight problem, plus weaker ESM story.
- **node:test without tsx**: would force a build step before tests run. Rejected — slower iteration loop.

**Implication for spec**: Update spec.md Assumption "test runner is vitest" → "test runner is `node:test` via `tsx --test`". (Tracked as a tiny doc update during implementation.)

## 2. Seeded PRNG: inline mulberry32

**Decision**: Hand-rolled mulberry32 in `src/sim/prng.ts` (~12 lines). Exposes `makePrng(seed: number) → () => number` returning floats in `[0, 1)`.

**Rationale**:
- Determinism is mandatory (FR-005, SC-004). `Math.random()` is non-deterministic across runs.
- mulberry32 is a 32-bit, single-line PRNG with adequate distribution for fixture generation and allocation sampling. Used widely in test harnesses.
- Zero dep. Self-contained, auditable in seconds.

**Alternatives considered**:
- **`seedrandom` package**: more rigorous but adds a runtime dep for a use-case that doesn't need cryptographic quality.
- **`crypto.randomInt` with a counter**: deterministic but slow and verbose for sampling.
- **xorshift / pcg32**: comparable quality, more code.

## 3. Refactor extraction strategy for `src/commands/partition.ts`

**Decision**: Extract in two moves. Both are purely structural — observable behaviour unchanged.

1. **Move FS-reading helpers** (`build`, `countLoc`, `isExcludedDir`, `isSourceFile`, the `EXCLUDE_DIR`/`SOURCE_EXTS`/`TEST_FILE_RE` constants, the `DirNode` and `FileNode` interfaces) into `src/sim/core/dirnode.ts` and re-export. `partition.ts` imports `buildFromFs`. Constants stay co-located with the FS code.
2. **Move the partitioning recursion** (`partitionNode`, the `Leaf`/`BinItem` interfaces, the `TARGET_LOC`/`SPLIT_AT` constants) into `src/sim/core/partition-core.ts` as an exported `partitionTree(root: DirNode, repoBase: string): Leaf[]`. `partition.ts` calls `partitionTree(buildFromFs(absRoot), REPO)` once per top-level workspace and keeps the rest of its IO shell (manifest write, scaffold writes, stdout).

**Rationale**:
- The current `partition.ts` already has a clean seam: FS walk → DirNode → recursion → Leaf[] → manifest write. The refactor extracts that seam without changing logic.
- Pin the equivalence with a golden snapshot test (scenario 90, scenario 91): freeze today's `leaves.gitignored.json` for the leaf-toolkit's own `src/` and assert the refactored CLI emits a byte-identical manifest.
- The relative-path conversion (`relative(REPO, ...)`) needs the repo base; `partitionTree` takes it as a parameter so the simulator can pass a synthetic root like `"/mock"`.

**Alternatives considered**:
- **Pure functional rewrite**: too much surface change for a 2-hour budget; risks behaviour drift.
- **Wrapper-only approach** (don't move code, just re-export): leaves FS reads coupled and defeats the simulator's "no FS" requirement (FR-001, scenario 92).
- **Parameterise over FS adapter**: more flexible but solves a problem we don't have. The `DirNode` type is already a perfect adapter point.

## 4. Real-`src/` regression anchor

**Decision**: Add `tests/sim/refactor-regression.test.ts` that, before any sim code is written, captures `leaves.gitignored.json` as a golden file at `tests/sim/__snapshots__/leaves.gitignored.json` by running `partition()` against the leaf-toolkit's own `src/`. After the refactor, the test re-runs `partition()` and asserts byte-identical output. A second test calls `partitionTree(buildFromFs(absRoot), REPO)` directly and asserts identical `Leaf[]` (per scenario 89).

**Rationale**:
- This is the single most important safety net. If it goes red, the refactor changed CLI behaviour and must be fixed before anything else.
- Snapshotting against the toolkit's own source means the harness ships with a real-world fixture without needing an external repo.

**Alternatives considered**:
- **Snapshot against a synthetic fixture only**: cheaper but proves nothing about real behaviour.
- **Snapshot against an external repo**: brittle (depends on an unrelated repo's state).

## 5. Visualisation format

**Decision**: ASCII tree using `├──`, `└──`, `│  `, ` `   characters with a fixed 2-space indent per level. Files are annotated as `name.ext  [L<id>]` or `name.ext  [L<id>.bin-<n>]`. Leaf legend appears below the tree as a numbered list mapping `<id>` → `<leaf path>`. Long paths wrap at 80 chars with a continuation marker.

**Rationale**:
- These box-drawing chars are the standard for tree output (`tree`(1), `npm ls`). They render cleanly inside markdown fenced code blocks (scenario 45).
- A separate legend keeps file lines short and stays readable when leaf paths are long.
- Numbered ids (`L1`, `L2`) instead of full paths in annotations keeps lines compact (scenario 47).

**Alternatives considered**:
- **JSON output only**: fails User Story 4 (the maintainer wants to *see* the partition).
- **Mermaid / DOT graph**: requires a renderer; the maintainer wants terminal-paste-friendly output.
- **Coloured terminal output**: irrelevant when pasted into markdown; reject for portability.

## 6. Allocation strategies

**Decision**: Three strategies in `src/sim/allocate.ts`, all sharing a `(leaves, k, seed) → Allocation` signature:

- **`round-robin`**: leaves cycled in their manifest order, agents indexed `0..k-1`. Each agent gets `ceil(n/k)` leaves; if `k > n`, leaves wrap (multiple agents per leaf — scenario 27/36).
- **`random-uniform`**: shuffle leaves with the seeded PRNG, then either with-replacement (`random-uniform-rep`, scenario 29) or without-replacement (`random-uniform`, scenarios 28/40).
- **`priority-weighted`**: caller supplies `priorityOf(leafId) → weight ≥ 0`; allocation samples leaves proportional to weight (scenarios 30/35). Zero-weight leaves are filtered out before sampling.

**Rationale**:
- These three cover the three failure modes the maintainer cares about: the optimistic case (`round-robin`), the "random" baseline (`random-uniform`), and real-world priority skew (`priority-weighted`).
- All three are deterministic given the seed (FR-008).
- Strategy is plugged via a discriminated union, not a class hierarchy — keeps each implementation under 30 lines.

**Alternatives considered**:
- **Greedy load-balancing**: optimal but doesn't reflect how agents pick leaves in practice (they don't have global view).
- **Strategy plugin contract**: overshoots; we want three named strategies, not an extension point.

---

**All NEEDS CLARIFICATION resolved.** Phase 1 may proceed.
