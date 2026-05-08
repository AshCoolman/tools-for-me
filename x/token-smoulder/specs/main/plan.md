# Implementation Plan: Token Smoulder — local quota-aware work dispatcher

**Branch**: `main` | **Date**: 2026-05-06 | **Spec**: [pm/PM.md](../../pm/PM.md)
**Input**: Feature specification at `pm/PM.md` (treated as authoritative spec; `/speckit-specify` was not run separately)

## Summary

Token Smoulder is a local CLI + daemon that converts spare AI-agent quota into useful
engineering progress without disrupting human-driven work. Dispatch is governed by
four gates — **Capacity, Contention, Value, Risk** — composed from small predicates.
External systems (quota tools, agent CLIs, human-input channels) sit behind named
adapters. Run state is durable on the local filesystem; every dispatch decision and
prompt step is appended to `events.ndjson` so runs are auditable and resumable across
process restarts. Default unattended risk allowlist is `['readonly', 'repo-local']`;
`destructive` and `privileged` work never runs unattended.

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode, ESM, Node `>=20`
**Primary Dependencies**: `commander` (CLI), `zod` (boundary schemas + type derivation),
`@inquirer/prompts` (terminal human-input fallback). No workflow framework, no DI
container, no plugin loader.
**Storage**: Local filesystem under `.orchestration-state/` — JSONL events, JSON run
records, lock files, suppression files. No database.
**Testing**: `vitest`. Slice-integration tests at adapter seams; unit tests for pure
predicates, work-parser, and hash/suppression-key derivation.
**Target Platform**: macOS and Linux developer machines. No Windows-first support.
**Project Type**: CLI tool with optional long-running daemon (single project).
**Performance Goals**: Single policy evaluation `<100ms`; full `scan` over 50
orchestration folders `<500ms`; daemon idle CPU `<1%`; no busy loops.
**Constraints**: Local-first; no remote host control; restart-safe state; conservative
failure (uncertain → false); minimal dependencies.
**Scale/Scope**: Tens of orchestration folders per repo; multi-day run lifetimes; one
or two concurrent runs total (lock-enforced).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Policy-Driven Dispatch | PASS | Dispatcher computes the four gates and emits a `DispatchDecision` enumerating passing and failing reasons. `check` and `run --once` share the same evaluator. |
| II. Adapter Boundaries | PASS | `AgentClient`, `QuotaSource`, `ContentionDetector`, `HumanInputChannel`, `Clock`, `Storage` each live under `src/adapters/<name>/` with a typed interface. Core never imports an implementation directly. |
| III. Composable Predicates Over Frameworks | PASS | Predicates are `() => Promise<PredicateResult>`; composed with `and` / `or`. No workflow engine, no plugin registry. New predicate = new file, no edits to dispatcher. |
| IV. Conservative Failure | PASS | `PredicateResult` returns `false` on error or uncertainty with a reason; boundary errors bubble as `BoundaryError(endpoint, args, code, original)`. No silent fallbacks. |
| V. Resumable, Auditable State | PASS | Run records persisted per prompt step; `events.ndjson` append-only; suppression key combines work/policy/executor hashes + failure signature; resume reads `latest.json` and continues from first incomplete step. |

**Initial gate**: PASS, no violations. **Post-design re-check** (after Phase 1): PASS,
no violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/main/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── cli-commands.md
│   ├── agent-client.ts
│   ├── quota-source.ts
│   ├── contention-detector.ts
│   ├── human-input-channel.ts
│   ├── storage.ts
│   └── events.md
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── dispatcher.ts          # evaluates 4 gates, emits DispatchDecision
│   ├── predicates/
│   │   ├── capacity.ts        # enoughQuota, quotaRemainingAbove
│   │   ├── contention.ts      # noExternalActiveSessionsFor, keyboardIdleFor
│   │   ├── value.ts           # queuedWorkExists, workFileChangedSinceLastRun
│   │   ├── risk.ts            # safeRiskClass, classifyRisk
│   │   ├── time.ts            # timeWindow
│   │   └── compose.ts         # and, or, dispatchWhen
│   ├── runner.ts              # state-machine prompt-step executor
│   ├── work-parser.ts         # work.md -> sections
│   ├── suppression.ts         # suppression-key derivation + checks
│   ├── locks.ts               # per-orchestration + global lock semantics
│   └── types.ts               # DispatchDecision, RunStatus, PromptStepState, RiskClass
├── adapters/
│   ├── agent/
│   │   ├── interface.ts       # AgentClient
│   │   └── claude-code.ts     # first concrete adapter
│   ├── quota/
│   │   ├── interface.ts       # QuotaSource
│   │   ├── claude-token-usage-fragile.ts
│   │   └── claude-token-simple.ts
│   ├── contention/
│   │   ├── interface.ts       # ContentionDetector
│   │   └── external-session-pid.ts
│   ├── input/
│   │   ├── interface.ts       # HumanInputChannel
│   │   ├── agent-remote.ts
│   │   ├── terminal.ts
│   │   └── file-inbox.ts
│   ├── clock/
│   │   ├── interface.ts       # Clock
│   │   └── system.ts
│   └── storage/
│       ├── interface.ts       # Storage (events, runs, locks, suppressions)
│       └── fs.ts              # filesystem-backed
├── cli/
│   ├── index.ts               # commander entry
│   ├── scan.ts
│   ├── list.ts
│   ├── check.ts
│   ├── run.ts
│   ├── daemon.ts
│   ├── state.ts
│   ├── events.ts
│   ├── suppressions.ts
│   ├── clear-suppression.ts
│   └── unlock.ts
├── lib/
│   ├── errors.ts              # BoundaryError, fail-loud helpers
│   ├── hashing.ts             # stable file-content hashing
│   ├── logging.ts             # structured event emitter
│   └── env.ts                 # process env access (single source)
└── index.ts                   # public re-exports for in-repo consumers (no barrel sprawl)

tests/
├── unit/
│   ├── predicates/
│   ├── work-parser.test.ts
│   ├── suppression.test.ts
│   └── hashing.test.ts
├── integration/
│   ├── dispatcher.test.ts
│   ├── runner-resume.test.ts
│   ├── adapters/
│   │   ├── quota-claude-token-simple.test.ts
│   │   ├── storage-fs.test.ts
│   │   └── agent-claude-code.test.ts
│   └── cli/
│       ├── scan.test.ts
│       ├── check.test.ts
│       └── run-once.test.ts
└── fixtures/
    └── orchestration/
        ├── valid-readonly/
        ├── valid-late-night/
        └── invalid-missing-executor/

orchestration/                 # user work units (runtime, gitignored except examples)
.orchestration-state/          # runtime state (gitignored)
```

**Structure Decision**: Single project, layered by responsibility:
`core/` (policy + execution + state) <- `adapters/` (external boundaries) <- `cli/`
(user-facing entry). `core` imports adapter **interfaces** only. Each adapter
implementation is swappable without touching `core`. CLI commands compose `core`
with concrete adapter wiring at startup. This satisfies Constitution Principle II
(Adapter Boundaries) by enforcing the import direction
`cli -> core -> adapters/interface <- adapters/<impl>`.

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | _(none)_ | _(none)_ |
