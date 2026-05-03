# Feature Specification: Fix Partition Stability

**Feature Branch**: `main` (trunk-based)
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "./pm/initial-plan.fix-partition-stability.md" — fix the two failure modes that the leaf-allocation simulator (spec 001) made measurable: bin-label instability under small source-tree mutations, and severe LOC imbalance across leaves.

## Problem

The simulator harness from spec 001 surfaced two concrete weaknesses in `partitionTree`. Both are reproducible from a fixture and a seed under `specs/001-leaf-allocation-sim/baseline/`.

### Problem A — bin labels are unstable under small mutations

`leaf sim report --fixture boundary-1499 --seed 1 --mutate grow:s1/f.ts:5 --json` shows that adding 5 LOC to a file in a directory at 1499 LOC pushes its parent across `SPLIT_AT=1500`, flipping a single subtree leaf into two `bin-1` / `bin-2` leaves. The drift report records `binsRenumbered=1`, `leavesAdded=[" bin-1", " bin-2"]`. **Any committed `LEAF.priority.bin-N.md` for the predecessor leaf is silently invalidated** — its bin index doesn't exist in the new partition.

The same pattern recurs in-place when a file inside an existing bin grows or shrinks: FFD bin packing is sort-by-size first then greedily assign, so a 5-LOC change to one file can re-shuffle every bin's membership and renumber the whole sequence.

This is the maintainer's load-bearing concern: priority decisions baked into filenames must survive everyday edits.

### Problem B — leaves are heavily imbalanced

`leaf sim baseline` against this repo's own `src/` reports `Balance: unbalanced (LOC max/min = 8.28)`. Three leaves at 1499 LOC, 1487 LOC, 181 LOC. The 181-LOC leaf carries the same scaffolding cost (`LEAF.partition.md`, `LEAF.audit.md`, agent dispatch overhead) as the larger ones but represents 5× less work. Round-robin agent allocation thus over-assigns the small leaf at parity with the large ones.

The current FFD strategy ("fill bins to SPLIT_AT, spill the rest into one final tiny bin") guarantees this shape whenever total LOC isn't a clean multiple of `TARGET_LOC`.

The simulator harness already exists (spec 001). What it now needs is for the production algorithm to pass the stability and balance checks it can already perform.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A small file edit doesn't rename my priority docs (Priority: P1)

As the maintainer, when I add 5–50 LOC to a single file already inside a bin, I want the bin's filename identifier to stay the same so the committed `LEAF.priority.bin-<id>.md` for that bin keeps attaching to the same logical bin without manual rename.

**Why this priority**: This is the single highest-value fix in the change. Today, any file edit large enough to shift FFD's sort can renumber every bin in the partition, silently invalidating committed priority docs. Without this, every other improvement is downstream of a fragile foundation.

**Independent Test**: Reproduce in the simulator. Take a fixture where partition produces ≥2 bins. Apply each of `grow:f:5`, `grow:f:50`, `shrink:f:5`, `addFile:small`. Re-partition. Assert that for any bin whose underlying file *set* is unchanged, the bin identifier on disk is the same string as before. Delivers value as a single regression check.

**Acceptance Scenarios**:

1. **Given** a partitioned tree with 3 bins under `src/`, **When** any single file inside `bin-X` grows by 5 LOC without the file leaving the bin, **Then** that bin's identifier in the new partition equals its identifier in the old one (string equality on the on-disk filename suffix).
2. **Given** a mutation that *does* relocate a file across bins (e.g. growing one file enough to push another out), **Then** the bins whose file sets did change get fresh identifiers, AND the bins whose file sets did not change keep their previous identifiers.
3. **Given** the same fixture and the same mutation applied twice, **When** partitioned each time, **Then** all bin identifiers are byte-identical (deterministic).

---

### User Story 2 — Leaves are roughly the same size (Priority: P1)

As the maintainer, when I dispatch one agent per leaf, I want each agent to see roughly the same amount of source code, so the slowest agent isn't 5–8× slower than the median and the smallest leaf isn't paying full scaffolding cost for a fraction of the work.

**Why this priority**: Equality-of-work is the user's explicit "nice attribute" from the simulator brief. The 8.28× ratio observed today makes round-robin agent allocation a poor model — small leaves complete in seconds while large ones run for minutes, but both consume an agent slot. Without this fix, the migration to N-agent parallelism delivers far less than N× speedup.

**Independent Test**: Run `leaf sim baseline` against this repo's `src/` and any harness fixture with subtreeLoc spread over the boundary. Assert `verdict ∈ {well-balanced, skewed}` (`max/min ≤ 3`).

**Acceptance Scenarios**:

1. **Given** this repo's current `src/` (≈3.2k LOC), **When** partitioned, **Then** `sim baseline` reports `max/min ≤ 3` across leaves.
2. **Given** any synthetic fixture in the harness with total LOC > `SPLIT_AT`, **When** partitioned, **Then** the per-leaf LOC distribution has `max/min ≤ 3`.
3. **Given** a single oversize subtree that must split into bins, **When** partitioned, **Then** no bin's LOC is < 0.4 × `TARGET_LOC` unless it is the only bin (i.e. no tiny tail bin).

---

### User Story 3 — A file edit near the split threshold doesn't suddenly create bins (Priority: P2)

As the maintainer, when a directory sits just below `SPLIT_AT` and one of its files grows by a handful of LOC, I want the partition to keep treating that directory as one subtree leaf rather than splitting it into bins on the spot, so my committed `LEAF.priority.md` (no bin suffix) keeps attaching.

**Why this priority**: This case is qualitatively different from US-1: there is no prior bin identifier to preserve, because the leaf was previously a single subtree. Adding hysteresis around `SPLIT_AT` keeps small mutations on the safe side of the boundary. Lower priority than US-1 because it is a stability win for one specific regime (just-under-threshold), not the general case.

**Independent Test**: Reproduce in the simulator with `boundary-1499` + `grow:s1/f.ts:5`. Assert `drift.binsRenumbered = 0`, `drift.leavesAdded = []`, `drift.leavesRemoved = []`.

**Acceptance Scenarios**:

1. **Given** a directory at 1499 subtreeLoc, **When** one file inside grows by 5 LOC (subtreeLoc → 1504), **Then** the partition keeps emitting one subtree leaf for that directory (no bin split).
2. **Given** the same directory grows past the upper hysteresis bound (subtreeLoc ≥ 1575 with margin = 5%), **When** re-partitioned, **Then** it splits into bins, and the bin identifiers are content-derived per US-1.
3. **Given** a directory that is currently in bin mode at 1480 subtreeLoc, **When** one file shrinks enough to drop subtreeLoc to 1450 (within the lower hysteresis bound), **Then** the partition keeps emitting bins, not a single subtree leaf, until subtreeLoc < 1425.

---

### User Story 4 — Existing committed priority docs migrate to the new naming scheme (Priority: P2)

As the maintainer, the moment the algorithm changes I have already-committed `LEAF.priority.bin-1.md`, `LEAF.priority.bin-2.md` files in my repo. I want a single command that walks the repo, computes the new content-derived identifiers, renames each existing file to its new identifier, and tells me which files moved (or were orphaned because their bin no longer exists).

**Why this priority**: Without migration, the algorithm fix is unshippable — landing it instantly orphans every committed priority doc until a human renames each one. The harness can't validate the production-repo state without this. Lower than US-1/US-2 because the algorithm is the real value; migration is the bridge.

**Independent Test**: Take a fixture with pre-existing `LEAF.priority.bin-1.md` files committed. Run the migration command. Assert that every file with a still-existing logical bin is renamed to `LEAF.priority.bin-<new-id>.md` and every file whose bin no longer exists is reported as orphaned (not deleted, not silently kept).

**Acceptance Scenarios**:

1. **Given** a repo with `LEAF.priority.bin-1.md` and `LEAF.priority.bin-2.md` under `src/foo/`, **When** the migration command runs against an unchanged tree, **Then** both files are renamed to `LEAF.priority.bin-<id>.md` with the new content-derived identifiers, and a summary lists each rename (`bin-1 → bin-3a7f2c`).
2. **Given** the same setup but with one bin removed (because `src/foo/` no longer crosses `SPLIT_AT`), **When** migration runs, **Then** the surviving bin's file is renamed and the now-orphaned file is reported as `orphaned: bin-N (no matching bin in new partition)` without being touched.
3. **Given** migration is run a second time on an already-migrated repo, **When** it executes, **Then** it reports `0 renamed, 0 orphaned` and exits cleanly (idempotent).

---

### Edge Cases

- A directory whose subtreeLoc lands inside the hysteresis band on a *fresh* repo with no prior partition — without history, hysteresis can't choose a side. The system MUST default to the under-threshold behaviour (single subtree leaf) on first partition.
- Two bins with identical file contents but different paths (theoretically possible in symlink-y trees) — the system MUST disambiguate by including paths in the hash input, not file contents.
- A bin shrinks to a single file — the content-derived identifier MUST still be stable; nothing about the encoding requires ≥2 files.
- Hash collision between two distinct bins in the same partition — the system MUST detect this and either lengthen the hash for that partition or fail loudly. A silent collision would alias two bins under one priority doc.
- Migration over a repo with no committed `LEAF.priority.bin-*.md` files — MUST exit successfully with a "nothing to migrate" report, not an error.
- Migration over a repo whose tree has changed since the last partition — the migration command MUST re-run partitioning from current source before computing renames; it MUST NOT assume the old `leaves.gitignored.json` (if any) is still accurate.
- A file with zero LOC inside a bin — MUST not change the bin's identifier when added or removed, because it carries no LOC weight; OR, if included for completeness, MUST be included consistently. The chosen behaviour MUST be documented in the harness fixtures.
- Re-partitioning produces the same bins but in a different sort order — bin identifiers MUST not depend on sort order; they MUST depend only on file-set membership.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST replace the integer `binIndex` as the on-disk identifier with a content-derived identifier computed deterministically from the bin's sorted file paths. Two partition runs over the same set of bin members MUST produce the same identifier; two partitions whose bins differ in member set MUST produce different identifiers.
- **FR-002**: The on-disk filename suffix for any per-bin doc (today: `LEAF.priority.bin-1.md`, future: `LEAF.priority.bin-<id>.md`) MUST use the content-derived identifier from FR-001.
- **FR-003**: The integer `binIndex` MUST remain in the `Leaf` shape as a sort/legibility aid (so JSON readers and human users can still see "bin 1 of 3"), but it MUST NOT appear in any filename or be load-bearing for cross-run continuity. `binIndex` MAY change run-to-run; the content-derived id MUST NOT (when underlying members are unchanged).
- **FR-004**: The partitioner MUST apply hysteresis around `SPLIT_AT`: a directory enters bin mode only when `subtreeLoc > SPLIT_AT × (1 + h)`, and once in bin mode MUST stay in bin mode until `subtreeLoc < SPLIT_AT × (1 - h)`. The hysteresis margin `h` MUST be configurable in source (single constant) and default to a value documented in Assumptions.
- **FR-005**: When prior partition state is unavailable (first run on a tree, or harness invocation without history), the partitioner MUST default to under-threshold behaviour (single subtree leaf) for any directory inside the hysteresis band.
- **FR-006**: The bin-packing strategy MUST distribute LOC across bins such that, for any partitioning of a directory's contents into ≥2 bins, the LOC max/min ratio is ≤ 3. The "fill to SPLIT_AT, spill remainder" tail-bin pattern MUST be eliminated.
- **FR-007**: For a tree whose total LOC and structure produce ≥2 leaves overall, the per-leaf LOC distribution MUST also satisfy max/min ≤ 3 (not just within a single oversize subtree's bins).
- **FR-008**: Existing safety properties MUST continue to hold after the algorithm change: zero file overlap between leaves in a single run (FR-004 of spec 001), zero intra-leaf duplicates, deterministic output given the same `DirNode` input.
- **FR-009**: A migration command MUST exist (working name: `leaf partition --migrate-bin-labels`, exact UX deferred to plan) that:
  - reads the current source tree
  - computes a fresh partition under the new algorithm
  - locates all existing `LEAF.<domain>.bin-*.md` files (where `<domain>` is `priority` or `audit` — both are user-edited / agent-edited and survive across runs via the `!existsSync` guard) in their on-disk locations. `LEAF.partition.bin-*.md` is regenerated each run and does not require explicit migration; the migration command MAY sweep it incidentally for tidiness.
  - renames each located file whose bin still exists in the new partition to its new content-derived filename
  - reports each rename, each unchanged file, and each orphaned file (no matching bin in new partition) without deleting orphans
  - is idempotent: running it twice on an already-migrated tree reports zero changes and exits cleanly.
- **FR-010**: The pure `partitionTree` function (FR-001/FR-002 of spec 001) MUST continue to exist with the same signature. The algorithm change happens behind that interface; the simulator harness MUST be able to consume the new output without code changes beyond renaming `binIndex → binId` in its assertions where it inspects identifiers.
- **FR-011**: Production CLI commands beyond `partition` and `priority` (today: `survey`, `coverage`, `audit`, `link`) MUST be updated where they reference `binIndex` as a key, but their external CLI surface (flags, output shape consumed by users) MUST remain unchanged. They consume `leaves.gitignored.json` and any one-line key swap is mechanical.
- **FR-012**: All algorithm-fix acceptance criteria MUST be measurable by the existing simulator harness from spec 001. Specifically: `sim report` and `sim baseline` MUST be the source of truth for stability, drift, and balance assertions. No new measurement infrastructure is in scope.
- **FR-013**: The harness's existing refactor-regression check (T009 in spec 001 tasks: "pure `partitionTree` returns identical `Leaf[]` to the production CLI for `src/` snapshot") MUST be regenerated as part of this change. Reviewers MUST consciously accept the new snapshot — the refactor-regression check is no longer load-bearing across this boundary, but it becomes the new floor for future refactors.
- **FR-014**: Hash collisions in a single partition's bin-id space MUST be detected. On detection, the system MUST either fail with a clear error message (preferred) or extend the hash length for that partition; it MUST NOT silently emit two bins with the same identifier.

### Key Entities

- **Leaf (modified)**: existing `{ path, scope, binIndex?, binTotal?, members?, files[], loc }` gains a `binId?: string` field. `binId` is the content-derived identifier from FR-001; `binIndex` retained per FR-003 as a non-load-bearing sort key.
- **PartitionRun (existing, from spec 001)**: now records `binId` for each bin leaf in addition to `binIndex`. The simulator's drift report inspects `binId` for cross-run identity, not `binIndex`.
- **MigrationReport** (new): `{ renamed: Array<{ oldName, newName, leafPath }>, unchanged: string[], orphaned: Array<{ name, leafPath, reason }> }`. Output of FR-009's migration command, suitable for inclusion in a commit message or PR body.
- **HysteresisState** (implicit): a directory's classification as `subtree` or `bin` may depend on whether it was previously in bin mode. Per FR-005, the default when prior state is absent is `subtree`. The mechanism by which "previously in bin mode" is detected (committed file presence, `leaves.gitignored.json`, or otherwise) is an implementation choice, but the *rule* is a contract.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `leaf sim report --fixture boundary-1499 --mutate grow:s1/f.ts:5` produces `drift.binsRenumbered = 0`, `drift.leavesAdded = []`, `drift.leavesRemoved = []`. Hysteresis keeps the directory as one subtree leaf.
- **SC-002**: `leaf sim report --fixture boundary-1700 --mutate grow:s1/f.ts:5` produces `drift.binsRenumbered = 0` even though both runs partition into bins, because bin identifiers are content-derived and the file's enclosing bin's member set is unchanged.
- **SC-003**: `leaf sim baseline` against this repo's `src/` reports `verdict ∈ {well-balanced, skewed}` (max/min ≤ 3). The current 8.28× ratio is gone.
- **SC-004**: For each of five mutation classes — `addFile`, `growFile`, `shrinkFile`, `removeFile`, `renameFile-within-leaf` — applied to at least two distinct fixtures (one with bins, one without), `sim report` produces drift consistent with US-1: bins whose member set is unchanged keep their identifier; bins whose member set changes get fresh identifiers.
- **SC-005**: Across all simulator fixtures, `overlap.overlapCount = 0` and `intraLeafDuplicates = []`. No regression on safety.
- **SC-006**: Running `leaf partition --migrate-bin-labels` against a repo with N existing `LEAF.priority.bin-*.md` files produces a report whose rename count + orphan count = N. Running it a second time produces a report with rename count = 0 and orphan count = 0 (idempotent).
- **SC-007**: Two runs of `leaf partition` over byte-identical `src/` produce byte-identical `leaves.gitignored.json` (deterministic, including `binId` values).
- **SC-008**: The pure `partitionTree` is the only surface where the algorithm change happens. Diff against pre-change `partition.ts` shows changes confined to (a) the partitioner, (b) callers that read `binIndex` for filename construction. No CLI flag added or removed except `--migrate-bin-labels`.

## Assumptions

- **Hash length**: 6 hexadecimal characters (24 bits) is sufficient for a single repo's bin set under realistic partition sizes; FR-014 covers the rare collision case. 8 characters would also be fine; 6 is chosen for legibility (`bin-3a7f2c` reads as one token).
- **Hysteresis margin**: `h = 0.05` (5%). At `SPLIT_AT = 1500`, this gives an upper bound of 1575 and lower bound of 1425. Larger margins (e.g. 10%) would mean more "leaves above TARGET_LOC" in steady state, which is a balance regression. 5% is the smallest value that still tolerates a 50-LOC growth without flipping a borderline directory.
- **Balance target**: max/min ≤ 3 is the floor; ≤ 1.5 is the stretch ("well-balanced" verdict from spec 001's harness). The stretch target is *not* an acceptance criterion — chasing it can force more re-bins than the toolkit's character justifies. The spec accepts the looser "skewed" verdict as a pass.
- **Migration scope**: a single `leaf partition --migrate-bin-labels` flag, run once per repo by the maintainer after the algorithm fix lands, is in scope. A separate `leaf migrate` command or a multi-spec rollout is not in scope.
- **`binIndex` retention**: kept alongside `binId`. JSON readers and the simulator visualisation continue to use `binIndex` for stable ordering ("bin 1 of 3"). On-disk filenames and cross-run identity move entirely to `binId`. Dropping `binIndex` is out of scope.
- **Algorithm class**: balanced bin-packing using a number-partitioning approach (LPT, multifit, or two-pass with `binCount = ceil(total / TARGET_LOC)` then descending-size distribution). The exact algorithm is a plan-phase choice; the spec only asserts the FR-006/FR-007 outcomes.
- **`TARGET_LOC` and `SPLIT_AT` constants**: unchanged from spec 001 (1000 and 1500). Out of scope to parameterise as flags.
- **Hysteresis state source**: the partitioner detects "previously in bin mode" by inspecting committed `LEAF.priority.bin-*.md` filenames in the target directory before partitioning. This makes hysteresis stateful in a controlled, file-scoped way (FR-005 governs the no-state default). Dropping committed-state lookup in favour of pure-input hysteresis (simulator-only) is acceptable if the implementation cost differential is large; the FR is on the *behaviour*, not the source of state.
- **`leaves.gitignored.json` schema**: gains a `binId` field per bin leaf. Older readers that look up `binIndex` continue to work for ordering; readers that previously used `binIndex` for cross-run identity must move to `binId`. There is no on-disk back-compat shim — the JSON is regenerated on every `leaf partition` and is gitignored.
- **No new test framework**: the existing harness from spec 001 (node:test via `tsx --test`) is the validation surface. No new dependencies.
- **Trunk-based**: this spec lives on `main`; speckit hooks are disabled per `.specify/extensions.yml`. The constitution forbids feature branches in this repo.
