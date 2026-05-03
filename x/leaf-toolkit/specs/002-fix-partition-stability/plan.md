# Implementation Plan: Fix Partition Stability

**Branch**: `main` (trunk-based) | **Date**: 2026-05-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/002-fix-partition-stability/spec.md`
**Predecessor**: [`specs/001-leaf-allocation-sim/`](../001-leaf-allocation-sim/) — provides `partitionTree`, fixtures, drift/balance reports.

## Summary

Fix two algorithm weaknesses surfaced by the simulator (spec 001):

1. **Bin labels stable under file-set-preserving mutations** — replace integer `binIndex` with a content-derived `binId` (6-hex of sha256 over sorted file paths). Add hysteresis around `SPLIT_AT` (`h = 0.05`) so a 5-LOC growth at 1499 LOC doesn't flip a directory from one subtree leaf to two bin leaves.
2. **Leaves balanced to `max/min ≤ 3`** — replace the FFD "fill to SPLIT_AT, spill remainder" pack with LPT (longest-processing-time) bin packing over a pre-computed `binCount = max(2, ceil(total / TARGET_LOC))`.

Plus a **one-shot migration command** (`leaf partition --migrate-bin-labels`) that walks committed `LEAF.priority.bin-N.md` files and renames them to `LEAF.priority.bin-<id>.md`. Idempotent. Reports renames, unchanged, and orphans.

The change is confined to `src/sim/core/partition-core.ts` (algorithm), the `Leaf` type (one new field), the seven call sites that today compute filename suffixes from `binIndex`, and one new flag in `partition.ts`. The simulator harness from spec 001 is the validation surface — `sim report` and `sim baseline` are the source of truth for SC-001 through SC-007.

The refactor-regression snapshot from spec 001 (T009) regenerates as part of this change. That is the load-bearing reviewer-conscious moment: after this lands, the new `leaves.gitignored.json` becomes the floor for future no-behaviour-change refactors.

## Technical Context

**Language/Version**: TypeScript on Node ≥ 20 (existing `engines`).
**Primary Dependencies**: existing only — `tsx`, `@inquirer/prompts`, `yaml`. **`node:crypto.createHash`** is used for the bin-id hash; built-in, no new dep.
**Storage**: none. Production CLI continues to write `leaves.gitignored.json` (gitignored) and per-leaf `LEAF.<domain>.md` docs. Migration command renames committed `LEAF.priority.bin-*.md` files in-place via `node:fs.renameSync`.
**Testing**: existing `node:test` + `node:assert/strict` via `tsx --test 'tests/**/*.test.ts'`. New tests live under `tests/sim/` alongside the spec-001 harness.
**Target Platform**: same as host CLI — macOS / Linux, Node ≥ 20.
**Project Type**: Single TS library + CLI (the leaf-toolkit). Algorithm change is internal; CLI surface gains exactly one flag.
**Performance Goals**: `partitionTree` continues to run sub-second over the host repo's `src/` (≤ 1 s). Hash computation is `O(files × pathLength)` per bin, dominated by the existing recursion cost.
**Constraints**: deterministic — same `DirNode` + same `priorBinDirs` → byte-identical `Leaf[]`. Bin-id is collision-resistant within a single partition (FR-014). Migration command is idempotent (FR-009).
**Scale/Scope**: ~1 algorithm file rewrite (~80 → ~140 LOC), 7 call-site one-line edits, 1 new migration code path (~80 LOC), 1 contract type addition, ~5 new test files under `tests/sim/`. Implementation budget: 3–4 h focused work (one sitting).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is the unmodified placeholder template (no principles ratified). The project's de-facto conventions (taken from `CLAUDE.md`, `CONVENTIONS.md`, the toolkit's character) translate to:

| Implicit principle | This plan's compliance |
|---|---|
| Minimal runtime deps; prefer Node built-ins | hashing uses `node:crypto`; no new deps. |
| Production CLI behaviour is contract | only externally-observable change is the bin-doc filename suffix and one new flag. `leaves.gitignored.json` schema gains `binId` (additive); existing keys unchanged. |
| LEAF docs are project vocabulary | filename change is `bin-<int> → bin-<hash>`; the doc *kind* (`partition`/`priority`/`audit`) and frontmatter shape are untouched. |
| Trunk-based, no feature branches | work lands on `main`; speckit hooks already disabled per `.specify/extensions.yml`. |
| Simulator is the validation surface | every acceptance criterion ties to `sim report` / `sim baseline`. |
| Refactor-regression test is the safety net | spec 001's `tests/sim/refactor-regression.test.ts` golden snapshot regenerates. The replacement snapshot becomes the new floor. |

**Result**: PASS. No violations to document under Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-fix-partition-stability/
├── plan.md                # this file
├── spec.md                # feature spec
├── research.md            # Phase 0 — algorithm choices, hash function, migration shape
├── data-model.md          # Phase 1 — type changes (Leaf.binId, MigrationReport, partition options)
├── quickstart.md          # Phase 1 — how to run the migration and verify with the harness
├── contracts/
│   ├── types.ts           # Phase 1 — additive type extensions
│   └── cli.md             # Phase 1 — `leaf partition --migrate-bin-labels` contract
├── checklists/
│   └── requirements.md    # spec quality checklist (passed)
└── tasks.md               # Phase 2 output — created by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

```text
src/
├── cli.ts                          # unchanged routing; no new verb
├── commands/
│   ├── partition.ts                # MODIFIED — accept --migrate-bin-labels; pass priorBinDirs to partitionTree;
│   │                               #   leafDocPath() uses binId; scaffolds emit binId in frontmatter
│   ├── priority.ts                 # MODIFIED — ManifestLeaf gains binId; priorityDocPath()/auditDocPath() use binId
│   ├── status.ts                   # MODIFIED — same one-line suffix swap (binIndex → binId)
│   ├── scope-from-priority.ts      # MODIFIED — same suffix swap
│   ├── link.ts                     # MODIFIED — same suffix swap
│   ├── sim.ts                      # unchanged
│   └── …                           # unchanged
├── doc/
│   └── parser.ts                   # MODIFIED — leafDocPath uses binId
├── sim/
│   ├── core/
│   │   ├── partition-core.ts       # REWRITTEN ALGORITHM — hysteresis + LPT pack + binId hashing
│   │   ├── dirnode.ts              # unchanged
│   │   └── prior-state.ts          # NEW — readPriorBinDirsFromFs(repoBase): Set<string>
│   ├── types.ts                    # MODIFIED — Leaf.binId added; MigrationReport added
│   ├── overlap.ts                  # MODIFIED — leafIdentity() uses binId
│   ├── drift.ts                    # MODIFIED — bin renumbering compares binId across runs
│   ├── visualise.ts                # MODIFIED — annotation uses binId in legend
│   ├── allocate.ts                 # unchanged (allocates by leaf identity)
│   ├── balance.ts                  # unchanged (LOC arithmetic only)
│   ├── collide.ts                  # unchanged
│   ├── fixtures.ts                 # unchanged
│   ├── mutations.ts                # unchanged
│   ├── prng.ts                     # unchanged
│   ├── report.ts                   # unchanged interface; transitive on the algorithm change
│   └── cli.ts                      # unchanged
└── types.ts                        # MODIFIED — re-export of binId-bearing Leaf

tests/
└── sim/
    ├── stability.test.ts                # NEW — US-1 acceptance; mutation × fixture matrix (SC-004)
    ├── balance-fix.test.ts              # NEW — US-2 acceptance; max/min ≤ 3 across host src/ (SC-003) and synthetic fixtures
    ├── hysteresis.test.ts               # NEW — US-3 acceptance; boundary-1499 grow:5 stays as one subtree (SC-001)
    ├── migration.test.ts                # NEW — US-4 acceptance; rename / orphan / idempotent (SC-006)
    ├── binid-collision.test.ts          # NEW — FR-014; constructed collision case
    ├── refactor-regression.test.ts      # MODIFIED — golden snapshot regenerated; commit message must call out the regen
    ├── boundary.test.ts                 # MODIFIED — pre-existing scenarios re-asserted under hysteresis
    └── (all other spec-001 tests)       # unchanged; assertions on `binIndex` switch to `binId` where they checked identity
```

**Structure Decision**: Single project. The simulator sub-module from spec 001 is the natural home for the algorithm; nothing splits out. The migration command is a flag on `partition.ts`, not a new verb — it composes with the rest of the partition pipeline (it must re-partition before computing renames, per the FR-009 idempotency requirement).

`src/sim/core/prior-state.ts` is the only genuinely new file. Everything else is an edit. Keeping prior-state lookup in a separate file lets `partitionTree` stay pure (`(root: DirNode, repoBase: string, priorBinDirs?: Set<string>) → Leaf[]`), with the FS reads isolated to one helper that the production CLI calls and the simulator skips.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Section retained per template.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
