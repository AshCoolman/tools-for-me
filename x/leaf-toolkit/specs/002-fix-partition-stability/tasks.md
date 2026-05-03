---
description: "Task list for Fix Partition Stability"
---

# Tasks: Fix Partition Stability

**Input**: Design documents in `specs/002-fix-partition-stability/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/types.ts, contracts/cli.md, quickstart.md
**Predecessor harness**: spec-001 (`tests/sim/`, `src/sim/`) is in place — it is the validation surface here.
**Tests**: Required — SC-001 through SC-007 are all measured by simulator-backed tests. Test tasks are first-class.
**Budget**: ~3–4 h focused work; one sitting. MVP = Phase 1 + Phase 2 + Phase 3 + Phase 6 (US1 algorithm + US4 migration on-disk delivery).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependency on incomplete tasks → may run in parallel.
- **[Story]**: User-story label. Foundational and Polish tasks have no story label.
- All paths are repo-relative from `x/leaf-toolkit/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type extension and contract sync. ~5 min.

- [X] T001 [P] Extend `Leaf` interface in `src/sim/types.ts` with `binId?: string` (additive). Verify TypeScript compile across the repo with `npx tsc -p .` (no other code edits in this task).
- [X] T002 [P] Mirror the additive types from `specs/002-fix-partition-stability/contracts/types.ts` into `src/sim/types.ts`: extend `BinSnapshot` to add `binId: string` (keep `binIndex: number` for human-readable diffs). Add `PartitionOptions { priorBinDirs?: ReadonlySet<string> }`. Add `MigrationReport` (with `MigrationRename`, `MigrationUnchanged`, `MigrationOrphan` sub-shapes).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure helpers that US1, US3, and US4 all consume. No production behaviour change yet. ~15 min.

**⚠️ CRITICAL**: Phase 3+ depends on T003 and T004 existing as exported symbols.

- [X] T003 Implement `computeBinId(sortedFilePaths: readonly string[]): string` in `src/sim/core/partition-core.ts` (or a new `src/sim/core/bin-id.ts` if `partition-core.ts` is getting crowded — pick one and stay there). Use `node:crypto.createHash("sha256")`, `update(sortedFilePaths.join("\n"))`, `digest("hex").slice(0, 6)`. Caller is responsible for sorting the input.
- [X] T004 [P] Implement `readPriorBinDirsFromFs(repoBase: string, candidateDirs: readonly string[]): ReadonlySet<string>` in new file `src/sim/core/prior-state.ts`. For each `candidateDir` (absolute), recursively walk and collect any directory containing a file matching `^LEAF\.[a-z]+\.bin-[A-Za-z0-9]+\.md$`. Return repo-relative dir paths. The regex matches both legacy (`bin-1`) and migrated (`bin-3a7f2c`) formats — migration must work without prior knowledge.
- [X] T005 [P] Add `tests/sim/bin-id.test.ts`: assert `computeBinId(["a","b","c"])` returns a 6-hex string; assert two calls with the same input are equal; assert two calls with different inputs are unequal; assert input ordering matters (caller's responsibility).

**Checkpoint**: T003 + T004 + T005 green. Helpers ready; partition algorithm still untouched.

---

## Phase 3: User Story 1 — Bin identifiers stable under in-bin file edits (Priority: P1) 🎯 MVP

**Goal**: Emit `binId` from `partitionNode` so two runs over identical bin-membership produce identical bin identifiers, regardless of LOC mutations inside files.

**Independent Test**: `npx tsx --test tests/sim/stability.test.ts` — passes against ≥ 2 fixtures × 5 mutation classes (`addFile`, `growFile`, `shrinkFile`, `removeFile`, `renameFile-within-leaf`). Assertions: bins whose member set is unchanged keep their `binId`; bins whose member set changes get fresh `binId`s. Determinism: same input → same `binId`s.

### Implementation for User Story 1

- [X] T006 [US1] Modify `partitionNode` in `src/sim/core/partition-core.ts` so that when `bins.length > 1`, each emitted `Leaf` includes `binId: computeBinId(sortedFiles)` where `sortedFiles` is `allFiles.map(f => relative(REPO, f.path)).sort()`. The `binIndex` and `binTotal` fields keep their current values (sort/legibility aid only). When `bins.length === 1` (single subtree leaf), `binId` is omitted. **After computing all `binId`s for the node's bins, check for collisions: if any two emitted leaves at this node share a `binId`, throw `Error('binId collision in partition: <node.path>: <colliding ids>')`. This satisfies FR-014 fail-loud at the partition level.**
- [X] T007 [P] [US1] Add `tests/sim/stability.test.ts` — for each fixture in `[boundary-1700, wide-shallow-with-bins]` and each mutation in `[addFile:loc=20, addFile:loc=0, growFile:5, shrinkFile:5, removeFile, renameFile-within-leaf]`: run partition pre-mutation, apply mutation, run partition post-mutation. For every bin in `prev` whose file-set is unchanged in `curr`, assert `binId` equality. For every bin whose file-set changed (including the `addFile:loc=0` case — 0-LOC files are part of the hash input per data-model validation rules), assert `binId` inequality.
- [X] T008 [P] [US1] Add `tests/sim/binid-collision.test.ts` — construct a partition where two bins would compute the same first-6-hex prefix (wrap or monkey-patch `computeBinId` so the test forces a 24-bit collision deterministically). Assert that `partitionTree` throws an `Error` whose message includes the colliding `binId` and the node path. Two leaves with the same `binId` in one partition MUST never be emitted.

**Checkpoint**: US1 green. Bin identity is stable under content-preserving mutations. Algorithm pack is still legacy FFD; balance is still poor.

---

## Phase 4: User Story 2 — Leaves balanced to max/min ≤ 3 (Priority: P1)

**Goal**: Replace FFD bin-packing inside `partitionNode` with LPT (longest-processing-time first) over a pre-computed `binCount`. Eliminate the "tail bin" pattern that produced the host repo's 8.28× imbalance.

**Independent Test**: `npx tsx --test tests/sim/balance-fix.test.ts` — runs `sim baseline` against this repo's `src/`, asserts `verdict ∈ {well-balanced, skewed}` (`max/min ≤ 3`). Plus 2–3 synthetic fixtures asserting the same.

### Implementation for User Story 2

- [X] T009 [US2] In `src/sim/core/partition-core.ts`, replace the FFD inner loop (lines ~46–63 of the current implementation: the `bins.sort(...)` + greedy-fill block) with LPT:
  1. compute `totalLoc = sum(small[].loc)`, `binCount = max(1, ceil(totalLoc / TARGET_LOC))`,
  2. if `binCount === 1`, fall through to the single-subtree-leaf emit path,
  3. otherwise sort `small` by `loc` descending, initialise `bins: BinItem[][] = [[], …]` of length `binCount` and `binLoc: number[] = [0, …]`,
  4. for each item, place it into the bin with the smallest current `binLoc` (tie-break: lowest index),
  5. emit one leaf per non-empty bin.
- [X] T010 [P] [US2] Add `tests/sim/balance-fix.test.ts` — invoke `sim baseline` (or the underlying `report({ fixture: real, … })` call). Assert `balance.verdict !== "unbalanced"`. **Assert `overlap.overlapCount === 0` and `overlap.intraLeafDuplicates.length === 0` against the same run** (FR-008 / SC-005 regression check post-algo-change). Plus assertions on synthetic fixtures: a fixture whose total LOC > `SPLIT_AT` produces ≥ 2 bins with `loc.maxOverMin ≤ 3` and no bin with `loc < 0.4 * TARGET_LOC` unless it is the only bin.
- [X] T011 [US2] Update `tests/sim/boundary.test.ts` (existing, from spec 001): the spec-001 scenarios that asserted specific bin counts under the old FFD pack will now produce different counts under LPT. For each broken assertion, update the expected value. Document the change in the commit body — these are intentional, motivated by FR-006 / FR-007.

**Checkpoint**: US2 green. The host repo's `sim baseline` reports a non-`unbalanced` verdict.

---

## Phase 5: User Story 3 — Hysteresis at SPLIT_AT (Priority: P2)

**Goal**: Thread `priorBinDirs` through `partitionTree` and apply the hysteresis rule at the SPLIT_AT branch in `partitionNode`. A 5-LOC growth at 1499 LOC stays as one subtree leaf when there is no prior bin state for that directory.

**Independent Test**: `npx tsx --test tests/sim/hysteresis.test.ts` — `boundary-1499 + grow:s1/f.ts:5` produces `drift.binsRenumbered = []`, `drift.leavesAdded = []`. Plus the lower-band case: a directory at 1480 with prior bin state stays in bin mode.

### Implementation for User Story 3

- [X] T012 [US3] Update `partitionTree` signature in `src/sim/core/partition-core.ts` to `(root: DirNode, repoBase: string, options?: PartitionOptions): Leaf[]`. The default for `options.priorBinDirs` is `new Set<string>()`.
- [X] T013 [US3] Modify the `SPLIT_AT` branch of `partitionNode` in `src/sim/core/partition-core.ts` to apply hysteresis. Add a constant `HYSTERESIS = 0.05` near `SPLIT_AT`. The new conditional:
  - if `node.subtreeLoc <= SPLIT_AT * (1 - HYSTERESIS)` → emit single subtree leaf (force under-threshold),
  - if `node.subtreeLoc >= SPLIT_AT * (1 + HYSTERESIS)` → emit bins (force over-threshold),
  - otherwise (in-band): if `priorBinDirs.has(relative(REPO, node.path))` → emit bins; else emit single subtree leaf (FR-005 default).
- [X] T014 [US3] Wire `readPriorBinDirsFromFs` (T004) into `src/commands/partition.ts`. Before each `partitionTree(...)` call inside the workspace loop, build `priorBinDirs = readPriorBinDirsFromFs(REPO, [abs])` and pass it as `{ priorBinDirs }`.
- [X] T015 [P] [US3] Add `tests/sim/hysteresis.test.ts` — three scenarios:
  1. Fixture at subtreeLoc=1499 with empty `priorBinDirs`, apply `grow:s1/f.ts:5`, re-partition with empty `priorBinDirs`. Assert both runs produce one subtree leaf for that directory; `drift.binsRenumbered = []`.
  2. Fixture at subtreeLoc=1700, partition with empty `priorBinDirs` → emits bins. Re-partition with `priorBinDirs = { "s1" }` and shrink to subtreeLoc=1480. Assert it stays as bins (lower-band hysteresis).
  3. Same fixture at subtreeLoc=1480, drop further to 1420 (below `SPLIT_AT * 0.95 = 1425`). Assert it collapses back to a single subtree leaf.

**Checkpoint**: US3 green. SC-001 (`boundary-1499 + grow:5 → drift = ∅`) is met.

---

## Phase 6: User Story 4 — Migration command + on-disk filename sweep (Priority: P2)

**Goal**: Land the call-site sweep (filenames now use `bin-<binId>` not `bin-<binIndex>`) and the `leaf partition --migrate-bin-labels` flag together. This is the user-facing delivery of US1 — without the sweep, the on-disk filenames don't actually become content-addressed.

**Independent Test**: `npx tsx --test tests/sim/migration.test.ts` — four scenarios: rename (priority + audit), orphan, idempotent, manifest-absent fallback. Plus a manual `leaf partition --migrate-bin-labels` against this repo verifies the report shape.

### Implementation for User Story 4

- [X] T016 [US4] Sweep filename suffix call sites in production code — change the suffix expression from `.bin-${leaf.binIndex}` to `.bin-${leaf.binId}` (with `binId` as the source of truth). Files (one-line edits each, but they all share an interface so do them as one logical task):
  - `src/commands/partition.ts` — `leafDocPath()`, `partitionScaffold()` frontmatter, `auditScaffold()` frontmatter
  - `src/commands/priority.ts` — `priorityDocPath()`, `auditDocPath()`, `ManifestLeaf` interface (add `binId?: string`)
  - `src/commands/status.ts` — leaf doc path computation; `ManifestLeaf` extension
  - `src/commands/scope-from-priority.ts` — leaf doc path computation; `ManifestLeaf` extension
  - `src/commands/link.ts` — leaf doc path computation; `ManifestLeaf` extension
  - `src/doc/parser.ts` — suffix logic
- [X] T017 [US4] Implement `leaf partition --migrate-bin-labels` in `src/commands/partition.ts`. Add an early-branch in the `partition()` function: if `_argv.includes("--migrate-bin-labels")`, run the migration pipeline:
  1. Compute `newLeaves` by running the normal partition over each `partitionRoot` (with `priorBinDirs` from T014).
  2. Optionally read the existing `leaves.gitignored.json` as the matching oracle.
  3. For each `partitionRoot`, walk the directory tree and find files matching `/^LEAF\.([a-z]+)\.bin-([A-Za-z0-9]+)\.md$/`.
  4. For each found file, classify as `renamed` / `unchanged` / `orphaned` per `data-model.md` rules. Match policy (research §6): old `binIndex` from prior manifest → matching new bin's `binId`; legacy `bin-N` filenames without manifest fall back to enclosing-directory match.
  5. Apply renames via `node:fs.renameSync`.
  6. Print the `MigrationReport` (human-readable by default, JSON when `--json` is also present). See `contracts/cli.md` for the exact stdout shape.
- [X] T018 [P] [US4] Add `tests/sim/migration.test.ts` covering:
  1. **Rename**: a temp dir with two pre-existing legacy `LEAF.priority.bin-1.md` / `LEAF.priority.bin-2.md` files **and matching `LEAF.audit.bin-1.md` / `LEAF.audit.bin-2.md`** files matching the synthetic fixture's bins. Run migration. Assert all four files are renamed to `LEAF.<domain>.bin-<id>.md` matching the new partition. Assert `report.renamed.length === 4` and the four renames cover both `domain: "priority"` and `domain: "audit"`.
  2. **Orphan**: a temp dir with `LEAF.priority.bin-1.md` whose enclosing directory no longer crosses SPLIT_AT (drop a file before migrating). Run migration. Assert `report.orphaned.length === 1`, file is NOT renamed, NOT deleted.
  3. **Idempotent**: run migration twice on a clean temp dir. Assert second run reports `renamed.length === 0`, `orphaned.length === 0`.
  4. **Manifest-absent fallback** (research §6): a temp dir with `LEAF.priority.bin-1.md` and `LEAF.priority.bin-2.md` but **no `leaves.gitignored.json`** (delete it before migration). Run migration. Assert the heuristic match correctly resolves both files (enclosing-directory match) and the report's `renamed` entries each include the resolved domain. If the fixture is constructed so two on-disk legacy bins match ambiguously to the new partition (e.g. three bins now where there were two), assert one entry surfaces with `reason: "ambiguous match"` in `orphaned`.

**Checkpoint**: US4 green. SC-006 met: rename + orphan + idempotent. The user can land the algorithm change on a real repo and run one command to migrate committed priority docs.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Update simulator infrastructure to use `binId` for cross-run identity, regenerate the refactor-regression snapshot, and run the quickstart smoke.

- [X] T019 [P] Update `src/sim/drift.ts` to use `binId` (not `binIndex`) when matching bins between `prev` and `curr`. Replace the existing `BinSnapshot` mapping (which used `binIndex`) with `binId`-keyed comparison. The `binsRenumbered` entry shape gains `binId` per `BinSnapshot`. Existing tests in `tests/sim/drift.test.ts` may need assertion updates if they introspect the snapshot shape.
- [X] T020 [P] Update `src/sim/overlap.ts` `leafIdentity()` to render bin leaves as `${leaf.path}#${leaf.binId}` (not `${leaf.path} bin-${leaf.binIndex}`). Update any test in `tests/sim/overlap.test.ts` whose assertions read these strings.
- [X] T021 [P] Update `src/sim/visualise.ts` legend to render bin annotations as `[L<id>.bin-<binId>]` instead of `[L<id>.bin-<binIndex>]`. Update `tests/sim/visualise.test.ts` golden expectations to match.
- [X] T022 Regenerate the refactor-regression golden snapshot: run `UPDATE_SNAPSHOTS=1 npx tsx --test tests/sim/refactor-regression.test.ts`. Verify `tests/sim/__snapshots__/leaves.gitignored.json` updates with the new `binId` field per bin leaf and the new pack/hysteresis output. **Commit message MUST include**: `Regenerate refactor-regression snapshot — partition algorithm intentionally changed (spec 002).` (Add the env-var-gated update path to `tests/sim/refactor-regression.test.ts` if it isn't already there: read `process.env.UPDATE_SNAPSHOTS === "1"` and write the snapshot when set; otherwise assert byte-equality.)
- [X] T023 Update existing `tests/sim/__fixtures__/host-src-snapshot/` to reflect any source files modified by T016 (`partition.ts`, `priority.ts`, `status.ts`, `scope-from-priority.ts`, `link.ts`, `doc/parser.ts`). The fixtures are flat copies of the host `src/` at snapshot time; regenerate via the existing snapshot script (or manually copy the changed files).
- [X] T024 [P] Run the quickstart smoke flow from `specs/002-fix-partition-stability/quickstart.md` §"Smoke flow": `npx tsx --test 'tests/sim/**/*.test.ts'` then `node --import tsx ./src/cli.ts partition` then `node --import tsx ./src/cli.ts sim baseline`. Inspect `summary.txt` — expect `clean`. Record any divergence by either fixing it or amending `quickstart.md` to match reality.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — no dependencies; T001 + T002 are [P]
- **Foundational (Phase 2)** — depends on Phase 1; T003 + T004 + T005 may run in parallel ([P]) once T001 lands
- **US1 (Phase 3)** — depends on T003 (computeBinId); the partition-core change in T006 must happen before T007/T008 (tests against it)
- **US2 (Phase 4)** — depends on T006 being in place (LPT replaces the FFD block; cleaner to layer on top of the binId change in one file)
- **US3 (Phase 5)** — depends on T004 + T009; T012 + T013 + T014 are sequential edits in two files; T015 (test) depends on T013/T014
- **US4 (Phase 6)** — depends on US1 (T006); T016 (call-site sweep) and T017 (--migrate flag) edit multiple files but conceptually atomic; T018 depends on T016 + T017
- **Polish (Phase 7)** — depends on US1–US4 complete; T022 must come after all algorithm changes are landed

### Within Each User Story

- Tests are first-class; for stability/balance/hysteresis/migration the test task is the deliverable verifying the implementation task.
- Different files marked [P] may run in parallel.
- `partition-core.ts` is touched by US1, US2, US3 — those tasks are sequential within that file.

### Parallel Opportunities

- T001 + T002 in Phase 1
- T003 + T004 + T005 in Phase 2 (T005 only tests T003 — wait until T003 is done)
- T007 + T008 within US1 (different test files)
- T010 within US2 (test file, different from T009/T011)
- T015 within US3 (test file)
- T018 within US4 (test file)
- T019 + T020 + T021 + T024 in Polish (different files; T022/T023 are sequential because both touch the snapshot)

---

## Parallel Example: User Story 1

```bash
# Sequential first — partition-core.ts edit:
Task: "T006 — Emit binId from partitionNode in src/sim/core/partition-core.ts"

# Then two test files in parallel:
Task: "T007 — Add tests/sim/stability.test.ts (mutation × fixture matrix)"
Task: "T008 — Add tests/sim/binid-collision.test.ts"
```

## Parallel Example: User Story 4

```bash
# Sequential — both touch many production files:
Task: "T016 — Sweep filename suffix call sites (6 files)"
Task: "T017 — Implement --migrate-bin-labels flag in partition.ts"

# Then test in parallel-with-other-stories:
Task: "T018 — Add tests/sim/migration.test.ts (rename / orphan / idempotent / manifest-absent)"
```

---

## Implementation Strategy

### MVP Path (~ 90 min)

1. Phase 1 (Setup) — 5 min
2. Phase 2 (Foundational) — 15 min — **stop and verify T005 green**
3. Phase 3 (US1 / binId emission + stability) — 25 min — **stop and verify T007/T008 green**
4. Phase 6 (US4 / call-site sweep + migration) — 35 min — **stop and verify T018 green; on-disk filenames now content-addressed**
5. Phase 7 partial: T022 (regen snapshot) — 5 min

At this point the change is shippable as far as the user's load-bearing concern goes (committed `LEAF.priority.bin-N.md` survives content-preserving edits via the new addressing scheme + migration command). Balance and hysteresis are improvements layered on top.

### Full Path (~ 3–4 h)

1. MVP — 90 min
2. Phase 4 (US2 / balanced pack) — 30 min — **stop and verify T010 green; baseline reports balanced**
3. Phase 5 (US3 / hysteresis) — 30 min — **stop and verify T015 green; SC-001 met**
4. Phase 7 remaining — 20 min

### Cross-Cutting Reminders

- T022 (snapshot regen) is the "reviewer-conscious moment" — call it out explicitly in the commit message.
- The algorithm edits in T006, T009, T013 all touch `src/sim/core/partition-core.ts`. Land them as separate commits where possible — easier to bisect and review.
- US1 (T006) without US4 (T016) is a half-shipped state: `binId` emitted but filenames still use `binIndex`. Do NOT pause between US1 and US4 if shipping to a real repo; either land both or stop after Phase 2.
- The migration command is one-shot per consumer repo. Do not auto-run it from `leaf partition` (research §5). Document the upgrade procedure in the toolkit's release notes when this lands.
- FR-014: collisions in `binId` space within a single partition must fail loudly. The production guard lives in T006 (in-loop check inside `partitionNode`); T008 asserts it. Silent collision aliases two bins under one priority doc — worse than the bug being fixed.
- **FR-007 escalation**: if T010 reports the host repo's `max/min > 3` after FR-006 lands, that falsifies research §4's assumption that within-bin balance suffices. Open a follow-up spec for cross-leaf merging (merge consecutive small subtree leaves into a synthetic rest-bin under their common parent). Do NOT attempt the merge inside this spec — it changes leaf identity in load-bearing ways and needs its own design pass.

---

## Notes

- 24 tasks total: 2 setup, 3 foundational, 3 in US1, 3 in US2, 4 in US3, 3 in US4, 6 in polish.
- Tasks per story: US1 = 3, US2 = 3, US3 = 4, US4 = 3.
- Independent test criteria are listed under each user story's "Independent Test" line.
- MVP scope = Phase 1 + Phase 2 + Phase 3 + Phase 6 (US1 algorithm + US4 user-facing delivery). US2 and US3 are shipped-on-top improvements.
- Tests are first-class (SC-001 through SC-007 are all simulator-measured); not optional.
- Avoid: editing `src/sim/core/partition-core.ts` from more than one task in flight at a time (T006, T009, T013 sequence); editing call sites (T016) from any task other than T016 in flight.
