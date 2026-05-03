# Implementation Plan: Leaf Allocation Simulator

**Branch**: `main` (trunk-based) | **Date**: 2026-05-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-leaf-allocation-sim/spec.md`

## Summary

Build an in-process simulation harness that exposes the leaf-toolkit's partitioning logic to synthetic source trees, mutations, and seeded agent allocations — then reports on safety (file overlap), drift (changes between runs), collision (agents touching the same files), and balance (per-leaf LOC/file equality). The first deliverable is the harness, not an algorithm fix; once visible, weaknesses motivate a follow-up spec.

Technical approach: extract the pure partitioning core from `src/commands/partition.ts` (currently coupled to filesystem walks, `repoRoot()`, and stdout writes) into `src/sim/core/partition-core.ts` so the simulator can call it directly with an in-memory `DirNode`. Add `src/sim/*` modules for fixtures, mutations, overlap, drift, allocation, collision, visualisation, and balance. Tests live under `tests/sim/*.test.ts` and run via Node's built-in test runner (`tsx --test`) — no new runtime or test dependencies are added. A standalone CLI entry under `src/sim/cli.ts` lets the maintainer run a single fixture's full report ad-hoc.

## Technical Context

**Language/Version**: TypeScript on Node ≥20 (as in `package.json` `"engines"`).
**Primary Dependencies**: Existing only — `tsx`, `@inquirer/prompts`, `yaml`. **No new deps** are added by this feature.
**Storage**: None. The simulator is in-process; reports go to stdout/snapshot files under `specs/001-leaf-allocation-sim/baseline/`.
**Testing**: `node:test` + `node:assert/strict` via `tsx --test 'tests/**/*.test.ts'`. Chosen over vitest to preserve the toolkit's zero-test-deps shape (see [research.md](research.md) §1).
**Target Platform**: Same as host CLI — macOS / Linux, Node ≥20. No browser, no Windows-specific paths.
**Project Type**: Single TS library + CLI (the existing leaf-toolkit shape; the simulator is an internal sub-module).
**Performance Goals**: Full simulator report (overlap + drift + allocate + visualise + balance) over a 200-leaf synthetic tree in ≤ 5 s on a developer laptop (SC-001, SC-006).
**Constraints**: Deterministic — same seed + same inputs → byte-identical outputs (FR-005, SC-004). Refactor MUST NOT change `leaves.gitignored.json` for any real input (FR-002, SC-005, scenario 90).
**Scale/Scope**: ~1 fixture builder + 8 sim modules + ~10 test files; all single-file, ≤ 200 LOC each. Implementation budget 2 h wall-clock (SC-007).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is the unmodified placeholder template (no principles ratified). There are no formal gates to check. The project's de-facto conventions (taken from `README.md`, `CONVENTIONS.md`, and the existing source) translate to:

| Implicit principle | This plan's compliance |
|---|---|
| Minimal runtime deps; prefer Node built-ins | no new deps; tests use `node:test` |
| LEAF docs are project vocabulary, not framework noise | harness consumes existing `Leaf` shape unchanged |
| Production CLI behaviour is contract | FR-014 + scenarios 89–94 enforce no behaviour drift |
| Trunk-based, no feature branches for short-term work | work lands on `main`; speckit hooks already disabled |

**Result**: PASS. No violations to document under Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-leaf-allocation-sim/
├── plan.md                # this file
├── spec.md                # feature spec
├── stories.bdd.md         # 100-word Gherkin summary of capability
├── research.md            # Phase 0 — decisions on test runner, seeded PRNG, refactor strategy
├── data-model.md          # Phase 1 — the simulator's entity shapes
├── quickstart.md          # Phase 1 — how to run the simulator and read its output
├── contracts/
│   ├── types.ts           # Phase 1 — public TS interfaces for sim entities
│   └── cli.md             # Phase 1 — standalone CLI invocation contract
├── checklists/
│   └── requirements.md    # spec quality checklist (passed)
├── baseline/              # produced by scenario 100 — checked into the spec dir
│   ├── overlap.txt
│   ├── drift-self.txt
│   ├── allocation-rr-k4.txt
│   ├── visualisation.txt
│   └── metrics.txt
└── tasks.md               # Phase 2 output — created by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

```text
src/
├── cli.ts                       # existing — root CLI dispatcher; gains a `sim` verb
├── commands/
│   ├── partition.ts             # REFACTORED — IO shell only; delegates to sim/core
│   ├── priority.ts              # unchanged
│   ├── link.ts                  # unchanged
│   ├── status.ts                # unchanged
│   └── …                        # unchanged
├── sim/                         # NEW — internal simulator module
│   ├── core/
│   │   ├── partition-core.ts    # NEW — pure partitionTree(root, repoBase) → Leaf[]
│   │   └── dirnode.ts           # NEW — DirNode/FileNode types + buildFromFs() + buildFromMock()
│   ├── fixtures.ts              # NEW — seeded fixture generator (4 named shapes + custom)
│   ├── mutations.ts             # NEW — addFile/removeFile/growFile/shrinkFile/renameFile/moveFile
│   ├── overlap.ts               # NEW — checkOverlap(leaves) → OverlapReport
│   ├── drift.ts                 # NEW — diffRuns(prev, curr) → DriftReport
│   ├── allocate.ts              # NEW — allocate(leaves, k, strategy, seed) → Allocation
│   ├── collide.ts               # NEW — collisionMatrix(allocation, leaves) → CollisionMatrix
│   ├── visualise.ts             # NEW — renderAscii(tree, leaves) → string
│   ├── balance.ts               # NEW — balanceMetrics(leaves) → BalanceReport
│   ├── prng.ts                  # NEW — seeded mulberry32 (≤ 20 lines)
│   ├── report.ts                # NEW — full-report orchestrator (overlap + drift + alloc + viz + balance)
│   └── cli.ts                   # NEW — standalone runner for a single fixture report
├── doc/                         # unchanged
├── plugins/                     # unchanged
├── repo-root.ts                 # unchanged
├── find-bin.ts                  # unchanged
└── types.ts                     # extended with shared sim types (re-exports from contracts/)

tests/
└── sim/
    ├── overlap.test.ts             # scenarios 1–12
    ├── drift.test.ts               # scenarios 13–25
    ├── allocate.test.ts            # scenarios 26–40
    ├── visualise.test.ts           # scenarios 41–50
    ├── balance.test.ts             # scenarios 51–60
    ├── boundary.test.ts            # scenarios 61–72
    ├── mutations.test.ts           # scenarios 73–82
    ├── determinism.test.ts         # scenarios 83–88
    ├── refactor-regression.test.ts # scenarios 89–94 (golden snapshot of leaves.gitignored.json)
    ├── pathological.test.ts        # scenarios 95–99
    └── baseline.test.ts            # scenario 100 — emits baseline/ artifacts
```

**Structure Decision**: Single project. The simulator is an internal sub-module of the existing single-package leaf-toolkit. It does not warrant a separate package because (a) it shares types with `commands/partition.ts`, (b) the refactor extraction is the load-bearing change, and (c) splitting would force a duplicate `Leaf` type definition.

The refactor of `src/commands/partition.ts` is structural-only:

- `build()` and `countLoc()` move to `src/sim/core/dirnode.ts` (renamed `buildFromFs`).
- `partitionNode()` and the leaf-emission logic move to `src/sim/core/partition-core.ts` (exported `partitionTree`).
- `partition.ts` keeps the verb's IO shell: workspace expansion, manifest write, scaffold writes, `process.stdout.write`. Its observable behaviour (the JSON manifest content and the stdout line) is unchanged — pinned by `tests/sim/refactor-regression.test.ts` against a golden snapshot.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Section retained per template.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
