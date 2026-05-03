---
description: "Task list for Leaf Allocation Simulator"
---

# Tasks: Leaf Allocation Simulator

**Input**: Design documents in `specs/001-leaf-allocation-sim/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/types.ts, contracts/cli.md, quickstart.md
**Tests**: Required — FR-012 mandates a runnable test suite. Test tasks are first-class.
**Budget**: 2 h wall-clock (SC-007). MVP = Phase 1 + Phase 2 + Phase 3 (US1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependency on incomplete tasks → may run in parallel.
- **[Story]**: User-story label. Foundational and Polish tasks have no story label.
- All paths are repo-relative from `x/leaf-toolkit/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding for the simulator module and its tests. ~5 min.

- [X] T001 Create directory scaffolding: `src/sim/`, `src/sim/core/`, `tests/sim/`, `tests/sim/__snapshots__/`, `specs/001-leaf-allocation-sim/baseline/`
- [X] T002 [P] Author `src/sim/types.ts` by transcribing the interface definitions from `specs/001-leaf-allocation-sim/contracts/types.ts` (runtime source of truth; contracts file stays as design reference)
- [X] T003 [P] Add a `test` script to `package.json`: `"test": "tsx --test 'tests/**/*.test.ts'"`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Refactor `src/commands/partition.ts` so the simulator can call the partitioning core directly, without changing observable CLI behaviour. The golden-snapshot regression test is the load-bearing safety net for the whole feature. ~30 min.

**⚠️ CRITICAL**: All user stories depend on Phase 2 completing. Do not start US work until T009 is green.

- [X] T004 Capture golden snapshot **before any refactor**: run `npm run leaf -- partition` against this repo's `src/`, copy the resulting `leaves.gitignored.json` to `tests/sim/__snapshots__/leaves.gitignored.json`
- [X] T005 [P] Implement seeded PRNG in `src/sim/prng.ts` (mulberry32, `makePrng(seed: number) => () => number`)
- [X] T006 Extract FS / DirNode helpers from `src/commands/partition.ts` into `src/sim/core/dirnode.ts`: move `build` (rename `buildFromFs`), `countLoc`, `isExcludedDir`, `isSourceFile`, the `EXCLUDE_DIR`/`SOURCE_EXTS`/`TEST_FILE_RE` constants, and the `DirNode`/`FileNode` interfaces. Add a `buildFromMock(repoBase: string, descriptor)` companion that constructs `DirNode` from a JS-object descriptor with deterministic LOC values
- [X] T007 Extract the partitioning core from `src/commands/partition.ts` into `src/sim/core/partition-core.ts`: move `partitionNode`, the `Leaf`/`BinItem` interfaces, the `TARGET_LOC`/`SPLIT_AT` constants. Export `partitionTree(root: DirNode, repoBase: string): Leaf[]`
- [X] T008 Refactor `src/commands/partition.ts` to import `buildFromFs` from `core/dirnode.js` and `partitionTree` from `core/partition-core.js`. Keep all IO (workspace expansion, manifest write, `LEAF.partition*.md` and `LEAF.audit*.md` writes, `process.stdout.write`) inside `partition.ts`
- [X] T009 Add `tests/sim/refactor-regression.test.ts`: (a) run `partition()` against this repo's `src/` and assert the resulting `leaves.gitignored.json` is byte-identical to `tests/sim/__snapshots__/leaves.gitignored.json` (scenario 90); (b) call `partitionTree(buildFromFs(absSrc), REPO)` directly and assert each `Leaf` field matches the snapshot's `leaves[]` (scenarios 89, 91, 92)

**Checkpoint**: Foundation ready. T009 must be green before any user-story task starts.

---

## Phase 3: User Story 1 — Detect file overlap between leaves (Priority: P1) 🎯 MVP

**Goal**: Make the safety property checkable: do any two leaves share a file in one partition run? Built first because every other concern depends on this baseline holding.

**Independent Test**: `npx tsx --test tests/sim/overlap.test.ts` — passes against synthetic fixtures and against the snapshot of this repo's `src/`.

### Implementation for User Story 1

- [X] T010 [P] [US1] Implement `src/sim/fixtures.ts` with at least the `flat-30` shape (30 small files in one dir, total LOC ~720, seeded LOC values via `makePrng`). Export `buildFixture(spec: FixtureSpec): FixtureBuild`
- [X] T011 [P] [US1] Implement `src/sim/overlap.ts`: `checkOverlap(leaves: Leaf[]): OverlapReport`. Detect cross-leaf file collisions, intra-leaf duplicates, return zero-counts affirmatively
- [X] T012 [US1] Add `tests/sim/overlap.test.ts` covering BDD scenarios 1, 2, 3, 4, 5, 6, 7, 10, 12 (depends on T010, T011)

**Checkpoint**: MVP complete. The maintainer can run the test suite and answer "do leaves overlap?" with proof.

---

## Phase 4: User Story 2 — Quantify drift between two partition runs (Priority: P1)

**Goal**: Produce a drift report comparing two `PartitionRun`s over a mutated tree. This is the user's primary suspicion made measurable.

**Independent Test**: `npx tsx --test tests/sim/drift.test.ts` — confirms a 5-LOC mutation near SPLIT_AT renumbers bins (or doesn't) and the report names exactly which files moved.

### Implementation for User Story 2

- [X] T013 [P] [US2] Add the `boundary-1500` shape to `src/sim/fixtures.ts`: a directory whose subtreeLoc is exactly 1500 across N siblings, plus variants at 1499 and 1501
- [X] T014 [P] [US2] Implement `src/sim/mutations.ts`: `applyMutation(build: FixtureBuild, m: Mutate): FixtureBuild` covering `addFile`, `removeFile`, `growFile`, `shrinkFile`, `renameFile`, `moveFile`, `addDir`, `removeDir`. Mutations return a new `FixtureBuild`; the input is untouched. Recompute `fileLoc`, `subtreeLoc`, `allFiles` on every dir on the path from root to the mutated node. `shrinkFile` clamps at 0
- [X] T015 [US2] Implement `src/sim/drift.ts`: `diffRuns(prev: PartitionRun, curr: PartitionRun): DriftReport`. Classify each file as added / removed / movedLeaf / renamed (heuristic: same leaf id, same LOC, different path). Detect bin renumbering (same path, different file set under same `bin-N` label) (depends on T014)
- [X] T016 [P] [US2] Add `tests/sim/mutations.test.ts` covering scenarios 73, 74, 75, 76, 77, 78, 79, 80, 81, 82 (depends on T014)
- [X] T017 [US2] Add `tests/sim/drift.test.ts` covering scenarios 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25 (depends on T013, T014, T015)
- [X] T018 [P] [US2] Add `tests/sim/boundary.test.ts` covering scenarios 61, 62, 63, 64, 66, 67, 68, 69, 70, 71, 72 (depends on T013)

**Checkpoint**: Both P1 stories deliver. The maintainer has measurable evidence for or against the bin-instability hypothesis.

---

## Phase 5: User Story 3 — Simulate K agents allocating across leaves (Priority: P2)

**Goal**: Allocate K agents across leaves under three strategies and report file-set collisions.

**Independent Test**: `npx tsx --test tests/sim/allocate.test.ts` — confirms round-robin without wrap is collision-free, with-replacement surfaces collisions explicitly.

### Implementation for User Story 3

- [X] T019 [P] [US3] Implement `src/sim/allocate.ts`: `allocate(leaves: Leaf[], opts: AllocateOptions): Allocation` covering `round-robin`, `random-uniform` (without replacement), `random-uniform-rep` (with replacement), `priority-weighted` (caller supplies `priorityOf`). All seeded via `makePrng`
- [X] T020 [P] [US3] Implement `src/sim/collide.ts`: `collisionMatrix(allocation: Allocation, leaves: Leaf[]): CollisionMatrix`. For every agent pair, compute `sharedLeaves` (intersection of `leafIds`) and `sharedFiles` (union of file sets across shared leaves). Also emit `agentLoad`
- [X] T021 [US3] Add `tests/sim/allocate.test.ts` covering scenarios 26, 27, 28, 29, 30, 31, 32, 35, 36, 37, 38, 39, 40 (depends on T019, T020)

**Checkpoint**: US3 done. The maintainer can model swarms and quantify collision risk per strategy.

---

## Phase 6: User Story 4 — Render an ASCII visualisation of a partition (Priority: P2)

**Goal**: Markdown-fence-safe ASCII tree of the source tree annotated with leaf ids.

**Independent Test**: `npx tsx --test tests/sim/visualise.test.ts` — confirms output is byte-identical across runs and renders without breaking inside fenced code blocks.

### Implementation for User Story 4

- [X] T022 [P] [US4] Implement `src/sim/visualise.ts`: `renderAscii(root: DirNode, leaves: Leaf[], opts?): string`. Use `├──`, `└──`, `│  ` characters with 2-space per-level indent. Annotate each file as `name.ext  [L<id>]` or `name.ext  [L<id>.bin-<n>]`. Append a numbered legend mapping ids → leaf paths
- [X] T023 [US4] Add `tests/sim/visualise.test.ts` covering scenarios 41, 42, 44, 45, 46, 49, 50 (depends on T022)

**Checkpoint**: US4 done. Visualisation is paste-ready for issues, PRs, and follow-up specs.

---

## Phase 7: User Story 5 — Report balance metrics per partition (Priority: P3, deferable)

**Goal**: Quantify equality of leaf assignments via mean / stddev / min / max / max-over-min ratios.

**Independent Test**: `npx tsx --test tests/sim/balance.test.ts` — confirms a 3× outlier surfaces in the max/min ratio.

**⚠️ Defer first if budget runs short.** US5 is the lowest priority; the harness still answers safety/drift/collision without it.

### Implementation for User Story 5

- [X] T024 [P] [US5] Implement `src/sim/balance.ts`: `balanceMetrics(leaves: Leaf[]): BalanceReport`. Compute `Stats` (mean, stddev, min, max, maxOverMin) for both LOC and file count. Verdict thresholds: well-balanced ≤ 1.5, skewed ≤ 3, unbalanced > 3, n/a for ≤ 1 leaves
- [X] T025 [US5] Add `tests/sim/balance.test.ts` covering scenarios 51, 52, 53, 54, 55, 57, 58, 59 (depends on T024)

**Checkpoint**: US5 done.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Orchestrator, CLI surface, determinism + pathological tests, and the real-`src/` baseline that scenario 100 demands. This phase is what closes SC-006.

- [X] T026 Implement `src/sim/report.ts`: `report(opts: ReportOptions): SimReport` orchestrating partition → optional mutation → second partition → overlap → drift → allocate → collide → visualise → balance → summary line
- [X] T027 Implement `src/sim/cli.ts`: standalone runner with `report`, `baseline`, `list-fixtures` subcommands per `contracts/cli.md`. Supports `--fixture`, `--seed`, `--mutate`, `--k`, `--strategy`, `--out`, `--json`. Exit code `0` for clean, `1` for violations
- [X] T028 Wire the `sim` verb into `src/cli.ts` (the existing root dispatcher) so `leaf sim …` resolves
- [X] T029 [P] Add `tests/sim/determinism.test.ts` covering scenarios 83, 84, 85, 86, 87, 88 (depends on T010, T014, T019, T022, T024 — i.e. all sim modules)
- [X] T030 [P] Add `tests/sim/pathological.test.ts` covering scenarios 95, 96, 97, 98, 99 (depends on T026)
- [X] T031 Add `tests/sim/baseline.test.ts` for scenario 100: invoke `report({ fixture: real, strategy: round-robin, k: 4 })`, write `baseline/{overlap,drift-self,allocation-rr-k4,visualisation,metrics,summary}.txt` under `specs/001-leaf-allocation-sim/baseline/`. Test passes if `summary` is `clean` OR if the test prints the named weakness (per SC-006 either outcome is acceptable evidence)
- [X] T032 [P] Update `specs/001-leaf-allocation-sim/spec.md` Assumption: change "test runner is vitest" → "test runner is `node:test` via `tsx --test`" (research.md §1 decision)
- [X] T033 [P] Run the recipes in `quickstart.md` manually as a smoke check; record any divergence in `quickstart.md` or fix the divergence in code

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — no dependencies; tasks T002, T003 are [P]
- **Foundational (Phase 2)** — depends on Phase 1; T004 must run before T008 (need golden snapshot before refactor); T005 is [P]; T006 and T007 must precede T008; T009 must be green before any user-story phase begins
- **User Stories (Phases 3–7)** — all depend on Phase 2; the five stories are independent and can be tackled in priority order or in parallel by different developers
- **Polish (Phase 8)** — T026 / T027 / T028 depend on the sim modules from US1–US4 existing; T031 depends on T026; T029 / T030 / T032 / T033 are [P] late tasks

### Within Each User Story

- Different files marked [P] may run in parallel
- Tests follow the implementation files they cover (the test imports them); the [P] markers reflect this where a test depends only on already-built modules

### Parallel Opportunities

- T002, T003 in Phase 1
- T005 in Phase 2 (PRNG is independent of the refactor extraction)
- T010 + T011 in US1 (different files), then T012 follows
- T013, T014, T016, T018 within US2 are different files; T015 depends on T014; T017 depends on T013/T014/T015
- T019, T020 in US3 are different files; T021 follows
- T022 in US4, T023 follows
- T024 in US5, T025 follows
- T029, T030, T032, T033 in Phase 8

---

## Parallel Example: User Story 1

```bash
# Implementation in parallel (different files, no inter-dep):
Task: "Implement src/sim/fixtures.ts (flat-30 shape)"           # T010
Task: "Implement src/sim/overlap.ts (checkOverlap)"             # T011

# Then the test (depends on both):
Task: "Add tests/sim/overlap.test.ts (scenarios 1–12)"          # T012
```

## Parallel Example: User Story 2

```bash
# Three [P] tasks against different files:
Task: "Add boundary-1500 fixture to src/sim/fixtures.ts"        # T013
Task: "Implement src/sim/mutations.ts"                          # T014
Task: "Add tests/sim/mutations.test.ts"                         # T016 (after T014)

# Then drift:
Task: "Implement src/sim/drift.ts"                              # T015 (after T014)
Task: "Add tests/sim/drift.test.ts"                             # T017 (after T013, T015)
Task: "Add tests/sim/boundary.test.ts"                          # T018 (after T013)
```

---

## Implementation Strategy

### MVP Path (≤ 1 h)

1. Phase 1 (Setup) — 5 min
2. Phase 2 (Foundational) — 30 min — **stop and verify T009 is green**
3. Phase 3 (US1 / overlap) — 20 min — **stop and verify the maintainer can answer "do leaves overlap?" with proof**

At this point the MVP ships. The remaining ~1 h delivers US2 (the user's primary suspicion) and as much of US3/US4/US5/Polish as fits.

### 2-Hour Path

1. MVP (Phases 1–3) — 1 h
2. Phase 4 (US2 / drift) — 30 min — **stop; the user's hypothesis is now testable**
3. Phase 5 (US3 / collision) — 15 min
4. Phase 6 (US4 / visualisation) — 10 min
5. Phase 8 essentials: T026 (orchestrator), T031 (baseline) — 5 min

If the budget is exceeded, defer in this order: US5 (T024, T025) → US4 (T022, T023) → US3 (T019, T020, T021). US1 and US2 are non-negotiable; they answer the user's actual questions.

### Cross-Cutting Reminders

- T009 (refactor regression) is the single most important test. If it goes red, stop and fix `partition.ts` before continuing.
- All sim modules MUST be deterministic given a seed (T029 enforces this).
- FR-014: do not change the partition algorithm. Algorithmic findings go into `baseline/summary.txt` for a follow-up spec.

---

## Notes

- 33 tasks total: 3 setup, 6 foundational, 3 in US1, 6 in US2, 3 in US3, 2 in US4, 2 in US5, 8 in polish.
- Tasks per story: US1 = 3, US2 = 6, US3 = 3, US4 = 2, US5 = 2.
- Independent test criteria are listed under each user story's "Independent Test" line.
- MVP scope = Phase 1 + Phase 2 + Phase 3 (US1). At MVP the harness can already say "leaves do/don't overlap in one run", which is the foundational safety question.
- Tests are first-class (FR-012); not optional.
- Avoid: editing `src/cli.ts` from more than one task (only T028 touches it); editing `src/commands/partition.ts` from more than one task (only T008 touches it).
