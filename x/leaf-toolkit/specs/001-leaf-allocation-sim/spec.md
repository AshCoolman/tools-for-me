# Feature Specification: Leaf Allocation Simulator

**Feature Branch**: `main` (trunk-based)
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "I'm convinced the leaf tree quickly starts to degrade — it seems to create bin-x files too much. Such that when I distribute agents amongst the leaves — they seem to allocate over the same files? I'm not 100% sure. Can you create a visualisation of a mocked file structure — and then test agent swarm allocation — checking for safety and other nice attributes — like equality of leaf src assignments. Especially with subsequent runs of LEAF generation and updates. This should reveal weaknesses in the leaf assignment strategy — and/or — dangers/risks in distributing agents. If we need to refactor heavily to allow the code to plug into simulations — let's do that. Let's aim for ~2hrs of work first."

## Problem

The maintainer suspects the partitioner has two failure modes that are invisible from production output:

1. **Bin-N proliferation and instability** — `LEAF.<domain>.bin-N.md` docs appear too readily, and a small change to the source tree (one file grows, one file is added) appears to renumber bins or shuffle which files belong to which bin. Because `LEAF.priority.bin-N.md` is the one committed leaf doc, instability there silently invalidates human-set priorities.
2. **Agent allocation collisions** — when multiple agents are dispatched, one per leaf, they may end up writing to overlapping file sets. The maintainer cannot tell whether this is an algorithm bug (two leaves sharing a file in one run) or a temporal bug (bin-2 today is bin-3 tomorrow, and an agent picked up the old assignment).

There is no harness today that can answer either question. Adding logging to the production CLI is the wrong shape — the maintainer needs to *inject* synthetic trees, *mutate* them deterministically, and *diff* successive runs.

The deliverable is a simulation harness, not an algorithm fix. Once the harness exists, weaknesses become visible and a follow-up spec can correct the algorithm with confidence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Detect file overlap between leaves in one partition run (Priority: P1)

As the maintainer, I want a yes/no answer to "does any file appear in two leaves' `files[]` arrays in a single partition run?" against a synthetic tree of my choosing, so I can either rule out the simplest safety violation or confirm it.

**Why this priority**: This is the foundational safety property. If it ever fails, every other concern is moot — agents are guaranteed to collide regardless of allocation strategy. It must be checkable cheaply and continuously.

**Independent Test**: Build a synthetic tree fixture, run partition, scan all `Leaf.files` arrays for any path appearing more than once. The simulator emits "no overlap" or lists offending paths with the leaves they appear in. Delivers value as a single-line CI check.

**Acceptance Scenarios**:

1. **Given** a synthetic tree of 50 files across 8 directories, **When** the simulator runs partition, **Then** it reports `overlap: 0` and lists each file with its sole owning leaf.
2. **Given** a tree carefully constructed to exercise both `subtree` and `bin` scopes, **When** partitioned, **Then** the simulator confirms zero overlap across the resulting leaves (or fails with a precise list).
3. **Given** a hypothetical broken partition function that emits overlapping leaves, **When** the simulator runs, **Then** it fails loudly with the offending file paths and which leaves contained each.

---

### User Story 2 — Quantify drift between two partition runs over a mutated tree (Priority: P1)

As the maintainer, I want to apply a small mutation to a synthetic tree (add one file, grow a file by N LOC, rename a file) and run partition twice, then receive a drift report describing exactly which leaves' file sets changed and which bin indices got reassigned.

**Why this priority**: This is the user's primary suspicion — that successive `leaf partition` runs degrade the bin assignments under realistic edits, silently breaking committed `LEAF.priority.bin-N.md` files. Without this report, "degradation" is a hunch; with it, every claim becomes a measurement.

**Independent Test**: Run partition on tree T, mutate to T', run partition again, diff the leaf manifests. The simulator outputs counts of (files moved leaf, bins renumbered, leaves added/removed) plus a per-file movement log. Delivers value as a regression check on partition stability.

**Acceptance Scenarios**:

1. **Given** a tree where one directory is at 1490 LOC (just under SPLIT_AT=1500) and the maintainer adds 20 LOC to one file, **When** partitioned twice, **Then** the drift report names every file that changed leaf and every bin index that was renumbered.
2. **Given** a tree mutation that adds one new small file to a leaf well under SPLIT_AT, **When** re-partitioned, **Then** the drift report shows exactly one file added to one leaf, with no other movement.
3. **Given** the same fixture and the same mutation applied twice, **When** partitioned each time, **Then** drift reports are byte-identical (deterministic).

---

### User Story 3 — Simulate K agents allocating across leaves and detect collisions (Priority: P2)

As the maintainer, I want to model a swarm of K agents picking work from a partition under different strategies (round-robin, random-uniform, priority-weighted) and have the simulator report any pair of agents whose assigned file sets intersect.

**Why this priority**: This is the user's collision concern made operational. If FR-003 (no overlap within one run) holds, any agent collision must come from either repeated leaf assignment or temporal drift between when agents picked work and when partition was last run. Either is worth surfacing.

**Independent Test**: Given a partition output and an allocation strategy, the simulator returns assignments and a collision matrix. Delivers value by quantifying whether the current strategy is safe under realistic K.

**Acceptance Scenarios**:

1. **Given** 10 leaves and 5 agents using round-robin allocation (one leaf each), **When** the simulator runs, **Then** the collision matrix is empty.
2. **Given** 10 leaves and 5 agents using random-uniform with replacement allowed, **When** the simulator runs, **Then** any agents assigned the same leaf are flagged as colliding on the leaf's full file set.
3. **Given** an allocation across runs T and T' (where partition has drifted), **When** an agent picked leaf "src/foo bin-2" at T and bin-2 now contains different files, **Then** the simulator surfaces the file-set difference.

---

### User Story 4 — Render a textual visualization of a partition over a synthetic tree (Priority: P2)

As the maintainer, I want a printable ASCII view of any partition: the source tree with each file annotated with its owning leaf id and (if applicable) bin index. This lets me eyeball pathological partitions instead of reading JSON.

**Why this priority**: Comprehension aid. The maintainer's complaint ("creates bin-x too much") is shape-driven; numbers help, but a visualization is what makes the problem obvious.

**Independent Test**: Pass any synthetic tree + partition result to the visualizer; receive a markdown-safe ASCII tree. Delivers value as documentation that can be pasted into the spec or a follow-up bug report.

**Acceptance Scenarios**:

1. **Given** a tree partitioned into 6 leaves with 2 bins among them, **When** rendered, **Then** the output shows the directory tree with each file labeled `[L3.bin-1]` etc., and a legend mapping leaf ids to paths.
2. **Given** two partition runs (pre- and post-mutation), **When** rendered side-by-side, **Then** the diff view highlights files that changed leaf assignment.

---

### User Story 5 — Report balance metrics per partition (Priority: P3)

As the maintainer, I want per-run balance metrics: leaf count, LOC mean/stddev/min/max ratio, file count mean/stddev — so I can claim or refute "leaves are well-balanced" with numbers.

**Why this priority**: Equality of assignment is the user's "nice attribute" — important but secondary to safety and stability. Without it the harness still answers the load-bearing questions.

**Independent Test**: Pass a partition result; receive a metrics block. Delivers value as a dashboard line.

**Acceptance Scenarios**:

1. **Given** a partition of 20 leaves with LOC values, **When** metrics are computed, **Then** mean/stddev/min/max/max-min ratio are emitted.
2. **Given** a partition where one leaf is 3× larger than the median, **When** metrics are computed, **Then** the max/min ratio surfaces this asymmetry.

### Edge Cases

- A directory whose subtreeLoc lands exactly on SPLIT_AT — does it split or stay together? The harness MUST cover this boundary.
- A single 5-LOC file added to a directory at the threshold — the harness MUST detect whether this triggers a full bin renumbering downstream.
- Tree with zero source files (no `.ts`/`.tsx`) — partition should return `[]`; the harness MUST verify.
- Tree with one source file far smaller than TARGET_LOC — should return one `subtree` leaf, no bins.
- Tree where the same directory contains both a deep subtree (>SPLIT_AT) and direct files — bin-packing of the direct-files-only "label" item alongside other small siblings.
- Mutation that *removes* a file — drift report MUST surface this without crashing.
- Allocation strategy where K (agents) > leaves — round-robin assigns multiples, simulator MUST report the resulting collisions clearly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a pure `partitionTree(root: DirNode): Leaf[]` function that takes an in-memory tree representation and returns the existing `Leaf[]` shape, with no filesystem reads, no console output, and no path-string assumptions beyond what the production code already requires.
- **FR-002**: The system MUST refactor `src/commands/partition.ts` so that the partitioning core (the existing `partitionNode` recursion + bin-packing) is exported and callable independently of `repoRoot()`, `readFileSync`, `writeFileSync`, and `process.stdout`. Production CLI behaviour MUST remain identical: same `Leaf[]` for the same filesystem input.
- **FR-003**: The system MUST provide a fixture builder that constructs synthetic `DirNode` trees from a declarative description (per-file LOC, directory shape, file naming), seeded for determinism.
- **FR-004**: The system MUST detect file-level overlap between leaves in a single partition run. Any file path appearing in `≥2` leaves' `files[]` arrays MUST be reported with the offending leaves named. Zero-overlap MUST be reported affirmatively, not by silence.
- **FR-005**: The system MUST run a partition twice on the same fixture and report exact equivalence (identical leaf paths, identical bin indices, identical file lists) or itemise all differences. Two runs over identical inputs MUST be byte-identical.
- **FR-006**: The system MUST support tree mutations applied between runs: add file, remove file, grow file by N LOC, shrink file by N LOC, rename file, move file across directories. Each MUST be a single function call against the in-memory tree.
- **FR-007**: The system MUST compute a drift report comparing two partition runs: count of files whose owning leaf changed, count of bins renumbered (same parent path, different file set under the same `bin-N` label), count of leaves added/removed, plus a per-file movement log.
- **FR-008**: The system MUST simulate K agents allocating across leaves under at least three strategies — round-robin, random-uniform-without-replacement, priority-weighted (where priority is supplied as input, since real priority lives in committed `LEAF.priority.md` files outside the simulator). Allocations MUST be deterministic given a seed.
- **FR-009**: The system MUST emit a collision matrix for any allocation: for every pair of agents, the set of file paths they both touch. Empty for valid allocations under non-replacement strategies; non-empty matrices MUST list the offending file paths.
- **FR-010**: The system MUST emit a textual visualisation of any partition: an ASCII tree of the source tree with each file annotated by its leaf id (and bin index when applicable), plus a legend. The output MUST be markdown-safe (no characters that break rendering inside fenced code blocks).
- **FR-011**: The system MUST emit balance metrics per partition: leaf count; total LOC; per-leaf LOC mean, stddev, min, max, max/min ratio; per-leaf file-count mean, stddev, min, max.
- **FR-012**: The harness MUST be runnable as a test suite (`npm test` or equivalent) so it doubles as a regression guard. It MUST also be runnable as a standalone CLI that prints a single fixture's report to stdout, for ad-hoc investigation.
- **FR-013**: The system MUST verify that the pure `partitionTree` returns identical `Leaf[]` to the production CLI when given a `DirNode` snapshotted from a real directory — providing a regression anchor that the refactor (FR-002) did not change behaviour.
- **FR-014**: The harness MUST NOT modify the partitioning algorithm itself. Algorithm changes are explicitly out of scope; the harness exists to make weaknesses visible. Any code change in `partition.ts` is restricted to extraction-style refactors that preserve output.

### Key Entities

- **DirNode (existing)**: in-memory directory representation with `path`, `files[]`, `dirs[]`, `fileLoc`, `subtreeLoc`, `allFiles[]`. The pure partition core already consumes this; the harness reuses it.
- **FileNode (existing)**: `{ path, loc }`. The fixture builder produces these synthetically.
- **Leaf (existing, unchanged)**: `{ path, scope, binIndex?, binTotal?, members?, files[], loc }`. The harness consumes this output without modification.
- **FixtureSpec**: declarative input to the fixture builder — directory shape, per-file LOC distribution, naming, seed.
- **PartitionRun**: `{ fixtureId, seed, leaves[], totalLoc, totalFiles, generatedAt }`. Snapshot for diffing.
- **DriftReport**: `{ filesMovedLeaf[], binsReassigned[], leavesAdded[], leavesRemoved[] }`. The output of comparing two `PartitionRun`s.
- **Allocation**: `{ strategy, seed, assignments: Map<agentId, leafId[]> }`.
- **CollisionMatrix**: `{ pairs: Array<{ agentA, agentB, sharedFiles[] }> }`. Empty when no agent pair overlaps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The maintainer can answer "do any two leaves ever share a file in one partition run?" against any of the harness's built-in fixtures in under 5 seconds wall-clock.
- **SC-002**: For a fixture mutated by adding one 50-LOC file to a directory near SPLIT_AT, the drift report names every file that changed leaf and every bin that was renumbered, with no false positives or false negatives.
- **SC-003**: The harness ships at least 4 distinct fixture shapes covering: flat-many-files, deep-narrow, wide-shallow with one oversize subtree, and pathological-boundary (a directory whose subtreeLoc is exactly SPLIT_AT). Each is reproducible from seed.
- **SC-004**: Running the simulator twice on the same fixture and seed produces byte-identical output across all reports (overlap, drift, collision, visualisation, metrics).
- **SC-005**: The pure `partitionTree` returns identical `Leaf[]` to the production CLI for a `DirNode` snapshot of `src/` in this repo. Equality is checked on `path`, `scope`, `binIndex`, `binTotal`, `members`, `files`, `loc`.
- **SC-006**: The harness produces at least one concrete, named weakness in the current partition strategy — backed by a reproducible fixture + mutation + drift report — within the 2-hour build budget. If no weakness is found, the harness reports a clean bill of health with the same evidence shape.
- **SC-007**: Total implementation completes in ≤ 2 hours of focused work. Scope creep beyond this budget rolls into a follow-up spec.

## Assumptions

- The production `src/commands/partition.ts` is the only place that decides leaf membership. Coverage, priority, scope, and survey commands consume the manifest but do not re-partition. (Confirmed by reading the file: only `partition()` writes `leaves.gitignored.json`.)
- `LEAF.priority.md` (committed, durable) is the only leaf doc whose stability across runs has user-visible consequences. Drift in regenerated docs (`LEAF.partition.md`, `LEAF.coverage.md`) is acceptable; drift in the bin index that tags a committed `LEAF.priority.bin-N.md` is NOT.
- The test runner is `node:test` invoked via `tsx --test 'tests/**/*.test.ts'`. The leaf-toolkit ships zero test deps; vitest was an early guess that research.md §1 overrode to keep the toolkit's zero-dep character.
- Synthetic fixture LOC values are integers ≥ 0; real `countLoc` returns lines-with-non-empty-trim, so fixture inputs match that semantic.
- The partition algorithm constants (`TARGET_LOC=1000`, `SPLIT_AT=1500`) are taken from the production source as-is. The harness does not parameterise them in the first cut.
- Out of scope for this 2-hour cut: any algorithm fix, any change to production CLI behaviour beyond the extraction refactor, integration with `leaf survey` or coverage tooling, real-FS round-tripping (the harness operates entirely on `DirNode` instances).
- Out of scope: agent execution itself. The harness simulates *allocation* (which agent gets which leaf) and reports collision risk; it does not run agents.
- The repo is trunk-based for the immediate term; this spec lives on `main` with no feature branch. Speckit hooks have been disabled accordingly.
