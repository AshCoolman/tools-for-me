---
description: "Task list for Token Smoulder — local quota-aware work dispatcher"
---

# Tasks: Token Smoulder — local quota-aware work dispatcher

**Input**: Design documents from `./specs/main/`
**Prerequisites**: plan.md (required), pm/PM.md (authoritative spec), scenarios.md (Given/When/Then user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. The constitution mandates test-first for `src/**` and `scripts/**`, with slice-integration tests at adapter seams.

**Organization**: Tasks are grouped by user story derived from `scenarios.md`. Each story is independently testable and ships as an MVP increment.

**User stories** (priority order):

- **US1 (P1) — One-shot dispatch on demand**: scan / list / check / run --once with all four gates and safety blocks. Covers scenarios S1, S3, S6.
- **US2 (P2) — Resumable, contention-safe execution**: crash recovery, stale-lock detection, mid-run pause when humans return. Covers S2, S5.
- **US3 (P3) — Daemon + suppression**: continuous evaluation, retry-storm protection. Covers S4.
- **US4 (P3) — Human-in-the-loop runs**: pause-for-human-input with channel-selection priority.

## Path Conventions

Single project at repo root `./`. Source under `src/`, tests under `tests/`, fixtures under `tests/fixtures/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure.

- [X] T001 Create source-tree directories per plan: `src/{core,core/predicates,adapters/{agent,quota,contention,input,clock,storage},cli,lib}`, `tests/{unit,integration,fixtures/orchestration}`, `orchestration/.gitkeep`, `.orchestration-state/.gitkeep`
- [X] T002 Update `package.json` to declare `"bin": { "token-smoulder": "bin/token-smoulder" }`, dependencies, and scripts (`build`, `test`, `typecheck`, `lint`) at `./package.json`
- [X] T003 [P] Add runtime deps `commander@^12`, `zod@^3`, `@inquirer/prompts@^5`, `ulid@^2` via `yarn add`
- [X] T004 [P] Add dev deps `vitest@^1`, `@types/node@^20`, `typescript@^5`, `eslint@^9`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin` via `yarn add -D`
- [X] T005 [P] Configure strict TypeScript at `./tsconfig.json` (`"strict": true`, `"module": "NodeNext"`, `"target": "ES2022"`, includes `src` + `tests`)
- [X] T006 [P] Configure vitest at `./vitest.config.ts` with `tests/**/*.test.ts` glob and `pool: 'forks'`
- [X] T007 [P] Configure ESLint at `./.eslintrc.cjs` per `.dev/docs/code-style.md` (no error-swallowing, no collector barrels in app code, `unknown` at boundaries)
- [X] T008 [P] Append to `./.gitignore`: `.orchestration-state/`, `orchestration/*` (preserving `orchestration/.gitkeep`), `dist/`, `coverage/`
- [X] T009 Create executable wrapper at `./bin/token-smoulder` that runs `npx --package=tsx@<pinned> --yes -- tsx ./src/cli/index.ts "$@"`; `chmod +x`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, errors, and helpers every user story depends on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T010 [P] Define core types `RiskClass`, `RunStatus`, `PromptStepState`, `DispatchDecision`, `PredicateResult`, `Predicate` in `src/core/types.ts` matching `specs/main/data-model.md`
- [X] T011 [P] Define internal types `RunRecord`, `SuppressionRecord`, `LockFile`, `AgentSession`, `Event`, `EventName`, `LockScope` in `src/adapters/storage/internal-types.ts` (re-exported by `src/core/types.ts` where shared)
- [X] T012 [P] Define `BoundaryError(endpoint, args, code, original)` and `fail-loud` helpers in `src/lib/errors.ts`; no silent fallbacks anywhere in this file
- [X] T013 [P] Implement deterministic SHA-256 file/content hashing in `src/lib/hashing.ts` (`hashFile(path)`, `hashContent(string)`)
- [X] T014 [P] Implement structured event emitter wrapper in `src/lib/logging.ts` (delegates to a `Storage.appendEvent` injected at construction; emits to stderr concise human form when stdout reserved for `--json`)
- [X] T015 [P] Implement single-source env access helper in `src/lib/env.ts` exposing typed accessors with the defaults from research.md R11: `TOKEN_SMOULDER_TICK_MS` (60000), `TOKEN_SMOULDER_TICK_OVERRUN_MS` (30000), `TOKEN_SMOULDER_LOCK_MAX_AGE_MS` (86400000), `TOKEN_SMOULDER_INPUT_TIMEOUT_MS` (1800000), `TOKEN_SMOULDER_SHUTDOWN_GRACE_MS` (60000), `TOKEN_SMOULDER_OWNER`
- [X] T016 [P] Test: `tests/unit/hashing.test.ts` — same content yields same hash; differing content differs; reads via `Storage` interface, not direct fs
- [X] T017 [P] Test: `tests/unit/errors.test.ts` — `BoundaryError` preserves endpoint, args, code, original error message; `JSON.stringify(err)` is stable

**Checkpoint**: Foundation ready — user stories can begin in priority order.

---

## Phase 3: User Story 1 — One-shot dispatch on demand (Priority: P1) 🎯 MVP

**Goal**: An engineer with spare quota can run one orchestration on demand. The dispatcher evaluates all four gates, refuses to run when any fails, blocks `destructive` risk unconditionally, and produces a complete audit trail.

**Independent Test**: Place a `valid-readonly` fixture under `tests/fixtures/orchestration/`. Run `token-smoulder check valid-readonly` — expect `shouldRun: true` with all four gate reasons listed. Run `token-smoulder run valid-readonly --once` — expect a completed run record at `.orchestration-state/runs/valid-readonly/latest.json` and the event sequence `policy_evaluated → dispatch_allowed → run_started → prompt_started → prompt_completed → run_completed` in `events.ndjson`. Replace risk class with `destructive` — expect `shouldRun: false` and `safeRiskClass` in `failedReasons`.

### Tests for User Story 1 (write first, must fail before implementation)

- [X] T018 [P] [US1] Test: `tests/unit/work-parser.test.ts` — section extraction, missing section throws `MissingSectionError`, body text preserved verbatim
- [X] T019 [P] [US1] Test: `tests/unit/predicates/compose.test.ts` — `and` short-circuits on first false; `or` short-circuits on first true; both surface reasons from constituent predicates
- [X] T020 [P] [US1] Test: `tests/unit/predicates/time.test.ts` — `timeWindow('19:00-23:30')` evaluated against an injected `Clock`; window crossing midnight handled
- [X] T021 [P] [US1] Test: `tests/unit/predicates/risk.test.ts` — `safeRiskClass(['readonly','repo-local'])` blocks `destructive` and `privileged` always, blocks unknown classes, allows declared classes
- [X] T022 [P] [US1] Test: `tests/unit/predicates/value.test.ts` — `queuedWorkExists` reads via `Storage` interface; non-empty selected section returns true; empty returns false with reason
- [X] T023 [P] [US1] Test: `tests/unit/predicates/capacity.test.ts` — `enoughQuota('week')` against fake `QuotaSource`; thresholds honoured; missing snapshot returns false
- [X] T024 [P] [US1] Test: `tests/unit/predicates/contention.test.ts` — `noExternalActiveSessionsFor('30m')` against fake `ContentionDetector`; conservative-failure path tested
- [X] T025 [P] [US1] Test: `tests/integration/dispatcher.test.ts` — full dispatcher with all adapter fakes; emits `DispatchDecision` with `reasons` and `failedReasons`; `policy_evaluated` event always written; capacity-fail path additionally writes `quota_insufficient` with correct scope/remaining/threshold
- [X] T025a [P] [US1] Test: `tests/integration/dispatcher-policy-change.test.ts` — given a saved RunRecord with `policyHash=X` and current `policy.ts` hashing to `Y`, the next dispatch emits `policy_changed` before `policy_evaluated`; v1 still proceeds with gate evaluation
- [X] T026 [P] [US1] Test: `tests/integration/adapters/storage-fs.test.ts` — `appendEvent` is append-only; `saveRun`/`loadLatestRun` round-trips; `acquireLock` second call throws on contention; uses `os.tmpdir()` for isolation
- [X] T027 [P] [US1] Test: `tests/integration/adapters/quota-claude-token-simple.test.ts` — substitutes a fixture script in `PATH` printing known JSON; asserts `QuotaSnapshot` parse + `BoundaryError` on non-zero exit
- [X] T028 [P] [US1] Test: `tests/integration/adapters/quota-claude-token-usage-fragile.test.ts` — same as T027 for the second adapter
- [X] T029 [P] [US1] Test: `tests/integration/adapters/agent-claude-code.test.ts` — substitutes a fake `claude` binary in `PATH`; asserts session start, prompt feed, `--owner=scheduler` arg + env tag, JSONL stream parsing, exit-code propagation
- [X] T030 [P] [US1] Test: `tests/integration/adapters/contention-external-session-pid.test.ts` — spawns a tagged child process; asserts it is excluded; spawns an untagged matching process; asserts it is detected
- [X] T031 [P] [US1] Test: `tests/integration/cli/scan.test.ts` — valid + invalid fixture folders surface in the right buckets; `--json` output matches `cli-commands.md` shape
- [X] T032 [P] [US1] Test: `tests/integration/cli/check.test.ts` — exits 0; does not start an agent session; output matches contract; `--strict` exits 3 on fail
- [X] T033 [P] [US1] Test: `tests/integration/cli/run-once.test.ts` — happy path completes; failed-gate path exits 3; lock-contention path exits 4

### Implementation for User Story 1

- [X] T034 [P] [US1] Implement `src/core/work-parser.ts` — split on `^# ` headings; `MissingSectionError(name)` on lookup miss; ~30 lines
- [X] T035 [P] [US1] Implement `src/core/predicates/compose.ts` — `Predicate = () => Promise<PredicateResult>`; `and`, `or`, `dispatchWhen`; short-circuit semantics
- [X] T036 [P] [US1] Implement `src/adapters/clock/interface.ts` — `Clock.now(): Date`
- [X] T037 [P] [US1] Implement `src/adapters/clock/system.ts` — system `Clock`
- [X] T038 [P] [US1] Implement `src/core/predicates/time.ts` — `timeWindow(spec)` using injected `Clock`
- [X] T039 [US1] Implement `src/adapters/quota/interface.ts` per `specs/main/contracts/quota-source.ts`
- [X] T040 [P] [US1] Implement `src/adapters/quota/claude-token-simple.ts` — spawn child, zod-parse stdout, `BoundaryError` on failure
- [X] T041 [P] [US1] Implement `src/adapters/quota/claude-token-usage-fragile.ts` — same shape, different parser
- [X] T042 [US1] Implement `src/core/predicates/capacity.ts` — `enoughQuota(scope)`, `quotaRemainingAbove(scope, threshold)`, conservative-failure on `BoundaryError`
- [X] T043 [US1] Implement `src/adapters/contention/interface.ts` per `specs/main/contracts/contention-detector.ts`
- [X] T044 [US1] Implement `src/adapters/contention/external-session-pid.ts` — process enumeration with configurable command patterns; excludes `TOKEN_SMOULDER_OWNER=scheduler`
- [X] T045 [US1] Implement `src/core/predicates/contention.ts` — `noExternalActiveSessionsFor(duration)`; conservative-failure returns false (caller treats as "active") on detector error
- [X] T046 [US1] Implement `src/core/predicates/value.ts` — `queuedWorkExists` (work.md exists, selected section non-empty, current work hash not yet completed via `Storage.loadLatestRun`)
- [X] T047 [US1] Implement `src/core/predicates/risk.ts` — `safeRiskClass(allowed)`, `classifyRisk(executor)`; unknown → `'destructive'` (blocked); `destructive`/`privileged` always blocked
- [X] T048 [US1] Implement `src/adapters/storage/interface.ts` per `specs/main/contracts/storage.ts` (full surface; suppression methods present in interface)
- [X] T049 [US1] Implement `src/adapters/storage/fs.ts` — `appendEvent` (`fs.appendFile` with newline), `readEvents`, `saveRun` / `loadLatestRun` / `loadRun`, `saveSession` / `loadSession`, `acquireLock` (atomic `fs.open(path,'wx')`), `releaseLock`, `inspectLock`. Suppression methods throw `Error('not implemented — added in US3')` for now.
- [X] T050 [US1] Implement `src/adapters/agent/interface.ts` per `specs/main/contracts/agent-client.ts`
- [X] T051 [US1] Implement `src/adapters/agent/claude-code.ts` — spawn `claude` with `--owner=scheduler`, env `TOKEN_SMOULDER_OWNER=scheduler`, JSONL stream parsing, status mapping; `BoundaryError` on transport failure
- [X] T052 [US1] Implement `src/core/locks.ts` — wraps `Storage.acquireLock`/`releaseLock`, emits `lock_acquired` / `lock_released` events
- [X] T053 [US1] Implement `src/core/dispatcher.ts` — composes the four gates, builds `DispatchDecision` with `reasons` + `failedReasons`, emits `policy_evaluated` always, `dispatch_allowed` on pass, and `dispatch_blocked` on fail. When the capacity gate fails, additionally emit `quota_insufficient` for each scope below threshold, with payload `{ scope, remaining, threshold }` derived from the latest `QuotaSnapshot`. Before gate evaluation, compare `policyHash` of `policy.ts` against `Storage.loadLatestRun(name)?.policyHash`; on mismatch, emit `policy_changed` with `{ previousHash, currentHash }`; do not block on change in v1
- [X] T054 [US1] Implement `src/core/runner.ts` MVP — `executeAgentWork({ riskClass, objective, context, constraints, promptFlow, stopConditions })`; sequential prompt-step loop; emits `run_started` / `prompt_started` / `prompt_completed` / `run_completed` / `run_failed`. NO resume, NO pause-for-input, NO suppression (US2/US3/US4)
- [X] T055 [US1] Implement `src/cli/index.ts` — commander entry; registers all subcommands; wires concrete adapters; resolves Storage path under `.orchestration-state/`
- [X] T056 [P] [US1] Implement `src/cli/scan.ts` — walks `./orchestration/`; reports valid + invalid; emits `orchestration_discovered` / `orchestration_invalid`; `--json` flag
- [X] T057 [P] [US1] Implement `src/cli/list.ts` — valid orchestrations + their declared `RiskClass` + latest run status if present
- [X] T058 [P] [US1] Implement `src/cli/check.ts` — evaluates `Dispatcher.evaluate`; prints decision per `cli-commands.md`; never starts a session; `--strict` exit 3 on fail
- [X] T059 [P] [US1] Implement `src/cli/run.ts` — `run <name> --once`; calls `Dispatcher.evaluate`, on pass acquires lock, calls `Runner.execute`; exit codes per `cli-commands.md` (3=gate fail, 4=lock contention, 5=boundary)
- [X] T060 [US1] Add fixture `tests/fixtures/orchestration/valid-readonly/{policy.ts,work.md,executor.ts}` — uses `safeRiskClass(['readonly'])`, `queuedWorkExists`, `riskClass: 'readonly'`, single-step prompt flow
- [X] T061 [US1] Add fixture `tests/fixtures/orchestration/valid-late-night/{policy.ts,work.md,executor.ts}` — full late-night example from PM.md
- [X] T062 [US1] Add fixture `tests/fixtures/orchestration/invalid-missing-executor/{policy.ts,work.md}` — used by scan tests
- [X] T063 [US1] Add fixture `tests/fixtures/orchestration/destructive/{policy.ts,work.md,executor.ts}` — declares `riskClass: 'destructive'`; used to assert unconditional block

**Checkpoint**: US1 ships. The MVP can scan, list, check, and run-once with full audit trail and safety gates.

---

## Phase 4: User Story 2 — Resumable, contention-safe execution (Priority: P2)

**Goal**: Runs survive process restart and pause cleanly when humans return. State on disk is the source of truth.

**Independent Test**: Start a multi-step run; kill the process between steps. Next dispatch detects stale lock; explicit `unlock` clears it; `run --resume` continues from the first incomplete step. Separately: open a tagged-as-external `claude` process during a run; the next prompt-step boundary emits `run_paused` with reason `external_session_detected`.

### Tests for User Story 2

- [X] T064 [P] [US2] Test: `tests/unit/locks-stale.test.ts` — `isLockStale` true when pid not alive; true when older than `maxAgeMs`; false otherwise
- [X] T065 [P] [US2] Test: `tests/integration/runner-resume.test.ts` — fabricate a `RunRecord` with two completed steps and one pending; resume completes the pending step without re-running completed
- [X] T066 [P] [US2] Test: `tests/integration/runner-pause-on-contention.test.ts` — between prompt steps, `ContentionDetector` reports active; runner emits the event sequence `external_session_detected` (payload `{ sessions: ExternalSession[] }`) followed by `run_paused` (reason `external_session_detected`), then calls `stopSession`
- [X] T066a [P] [US2] Test: `tests/integration/runner-pause-on-contention.test.ts` (extension) — assert offending pids appear in the `external_session_detected` payload and that the `run_paused` event references the same pids in its reason context
- [X] T067 [P] [US2] Test: `tests/integration/cli/unlock.test.ts` — refuses to clear a lock whose pid is alive; `--force` requires TTY confirmation; non-TTY without `--force` exits non-zero
- [X] T068 [P] [US2] Test: `tests/integration/cli/run-resume.test.ts` — `run <name> --resume` reads `latest.json`, skips completed steps

### Implementation for User Story 2

- [X] T069 [P] [US2] Extend `src/core/locks.ts` with `isStale(lock, maxAgeMs)` calling `process.kill(pid, 0)` (catch `ESRCH`) and timestamp comparison; emit `lock_stale` event
- [X] T070 [P] [US2] Extend `src/adapters/storage/fs.ts` with `isLockStale` per interface
- [X] T071 [US2] Extend `src/core/runner.ts` with resume path: when `run --resume` invoked, load `latest.json`, advance to first `pending`/`failed` step, reuse `sessionId` if alive else open new
- [X] T072 [US2] Extend `src/core/runner.ts` with between-step contention re-check: call `ContentionDetector.isActiveWithin(thresholdMs)` before each `prompt_started`; on true, emit `external_session_detected` (payload `{ sessions: ExternalSession[] }`) followed by `run_paused` (reason `external_session_detected`), `stopSession`, release lock
- [X] T073 [US2] Implement `src/cli/unlock.ts` — checks pid alive; `--force` flag with TTY confirm via `@inquirer/prompts`; supports `<name>` and `--global`
- [X] T074 [US2] Extend `src/cli/run.ts` with `--resume` flag wiring the runner's resume path

**Checkpoint**: US2 ships. Runs are restart-safe and contention-safe.

---

## Phase 5: User Story 3 — Daemon + suppression (Priority: P3)

**Goal**: A boring continuously-running daemon with retry-storm protection.

**Independent Test**: Configure a fixture orchestration that fails deterministically at prompt step 2 with a stable failure signature. Run twice. After the second failure, `suppressions` lists an active record; subsequent dispatches emit `run_suppressed`; `clear-suppression <id>` unblocks. Daemon SIGINT after a started run completes the in-flight step then exits.

### Tests for User Story 3

- [X] T075 [P] [US3] Test: `tests/unit/suppression.test.ts` — suppression key is deterministic over `{orchestrationName, workHash, executorHash, policyHash, failingPromptIndex, failureSignature}`; identical inputs → identical key; any input changes → different key
- [X] T076 [P] [US3] Test: `tests/integration/suppression-flow.test.ts` — first failure records (count=1, no block); second identical failure activates suppression; third dispatch attempt emits `run_suppressed`; `clearSuppression` unblocks
- [X] T077 [P] [US3] Test: `tests/integration/cli/daemon-shutdown.test.ts` — SIGINT after a started run waits up to `TOKEN_SMOULDER_SHUTDOWN_GRACE_MS` (default 60000) for the in-flight step; writes `run_paused` if the step doesn't complete in time or `run_completed` if it finishes, releases locks, exits 0
- [X] T078 [P] [US3] Test: `tests/integration/cli/daemon-tick-overrun.test.ts` — when a tick exceeds 30s (using fake clock), `tick_overran` event is appended
- [X] T079 [P] [US3] Test: `tests/integration/cli/suppressions.test.ts` — `suppressions` lists active records; `clear-suppression <key>` clears
- [X] T080 [P] [US3] Test: `tests/integration/cli/state.test.ts` — `state <name>` reads `runs/<name>/latest.json`
- [X] T081 [P] [US3] Test: `tests/integration/cli/events.test.ts` — `events --since=10m --type=dispatch_blocked` filters correctly

### Implementation for User Story 3

- [X] T082 [P] [US3] Implement `src/core/suppression.ts` — key derivation; `findActive(work,executor,policy,orchestrationName)`; `recordFailure(...)` (count=1 → record, count=2 → activate)
- [X] T083 [P] [US3] Replace `not implemented` stubs in `src/adapters/storage/fs.ts` with `saveSuppression` / `listActiveSuppressions` / `clearSuppression` (one JSON file per key under `.orchestration-state/suppressions/`)
- [X] T084 [US3] Wire suppression check at the start of `src/core/dispatcher.ts` — emit `run_suppressed` and short-circuit before gate evaluation when an active suppression matches
- [X] T085 [US3] Wire suppression record in `src/core/runner.ts` on `run_failed` — derive `failureSignature` (normalize stack/error, strip absolute paths and timestamps), call `Suppression.recordFailure`
- [X] T086 [US3] Implement `src/cli/daemon.ts` — `setInterval`-based tick loop honouring `--tick`; `--global-lock` flag; SIGINT/SIGTERM handlers calling `Runner.gracefulStop`; `tick_overran` event when tick > 30s
- [X] T087 [P] [US3] Implement `src/cli/suppressions.ts`
- [X] T088 [P] [US3] Implement `src/cli/clear-suppression.ts`
- [X] T089 [P] [US3] Implement `src/cli/state.ts` — print `runs/<name>/latest.json`
- [X] T090 [P] [US3] Implement `src/cli/events.ts` — `--since=<duration>` parser; `--type=<event>` filter; default last 100 lines

**Checkpoint**: US3 ships. The daemon runs unattended without retry storms.

---

## Phase 6: User Story 4 — Human-in-the-loop runs (Priority: P3)

**Goal**: Runs can pause for a human answer over the first available channel and resume cleanly.

**Independent Test**: Run a fixture whose agent response sets `needsInput: true` at step 2. The runner emits `input_requested`; provide an answer through the active channel; runner emits `input_received`; run resumes and completes. Repeat with each channel forced via env: `agent-remote`, `terminal`, `file-inbox`. Disabling the chosen channel mid-request surfaces a loud `BoundaryError`, not a fall-through to the next channel.

### Tests for User Story 4

- [X] T091 [P] [US4] Test: `tests/integration/adapters/human-input-terminal.test.ts` — terminal impl with mocked `@inquirer/prompts`; honours `timeoutMs`
- [X] T092 [P] [US4] Test: `tests/integration/adapters/human-input-file-inbox.test.ts` — writes `<runId>.req`, polls for `<runId>.res`, returns content; times out cleanly
- [X] T093 [P] [US4] Test: `tests/integration/adapters/human-input-agent-remote.test.ts` — substitutes a fake `agent-remote` binary in `PATH`; asserts request payload + response handling
- [X] T094 [P] [US4] Test: `tests/integration/runner-human-input.test.ts` — `needsInput: true` → emits `input_requested`, calls `HumanInputChannel.request`, emits `input_received`, sends answer back as the next prompt, completes run

### Implementation for User Story 4

- [X] T095 [P] [US4] Implement `src/adapters/input/interface.ts` per `specs/main/contracts/human-input-channel.ts`
- [X] T096 [P] [US4] Implement `src/adapters/input/agent-remote.ts` — `isAvailable()` via `which agent-remote`; spawn with stdin payload, stdout response; `BoundaryError` on non-zero exit
- [X] T097 [P] [US4] Implement `src/adapters/input/terminal.ts` — `isAvailable()` via `process.stdin.isTTY`; uses `@inquirer/prompts.input()`
- [X] T098 [P] [US4] Implement `src/adapters/input/file-inbox.ts` — write `.req` to `.orchestration-state/inbox/`, poll every 2s for `.res`, honour `timeoutMs`
- [X] T099 [US4] Channel-selection logic in `src/cli/index.ts` — query `isAvailable()` in priority order, bind one channel for the run; mid-request failure of bound channel surfaces as `BoundaryError`, NOT a silent fall-through
- [X] T100 [US4] Extend `src/core/runner.ts` — on `AgentResponse.needsInput=true`, emit `input_requested`, call bound channel's `request`, emit `input_received`, feed answer as next prompt; record `paused → running` transition

**Checkpoint**: US4 ships. Humans can answer agent questions through any of the three channels.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T101 [P] Update `./README.md` to point at `specs/main/quickstart.md` and the constitution
- [X] T102 [P] Run `npx tsc --noEmit` against full `src/` + `tests/`; fix any strict-mode issues without weakening types
- [X] T103 [P] Run `npx eslint src tests` per `.dev/docs/code-style.md`; fix violations without disabling rules
- [X] T104 [P] Smoke test: run quickstart.md end-to-end against `tests/fixtures/orchestration/valid-readonly/`; assert event sequence in `events.ndjson`
- [X] T105 Add `package.json` `files` entries: `src`, `bin`, `README.md`, `specs/main/contracts/*.ts` (so consumers can import contract types)

---

## Dependencies

```
Phase 1 (Setup) ───────────────► Phase 2 (Foundational) ───────────────►
                                                                       │
                                  ┌────────────────────────────────────┤
                                  ▼                                    │
                               US1 (P1) — MVP ────┐                    │
                                                  ▼                    │
                                              US2 (P2) ────┐           │
                                                           ▼           │
                                                       US3 (P3) ──┐    │
                                                                  │    │
                                                       US4 (P3) ──┤    │
                                                                  ▼    │
                                                              Phase 7 ◄┘
```

- **Phase 2** blocks all user stories (shared types, errors, logging).
- **US1** is the MVP — the system is useful as soon as US1 ships.
- **US2** depends on US1 (extends runner + storage + cli/run).
- **US3** depends on US1 (suppression sits in dispatcher; daemon wraps run).
- **US4** depends on US1 (human-input pause is a runner extension); independent of US2/US3.
- **Phase 7** runs after every story in scope is merged.

---

## Parallel Execution Examples

### Within Phase 2 (Foundational)

T010, T011, T012, T013, T014, T015, T016, T017 are all `[P]` — different files, no dependencies. Dispatch as one batch.

### Within US1 — Tests batch (must fail before implementation)

T018–T033 are all `[P]` — different test files. Dispatch as one batch; verify all fail.

### Within US1 — Predicates batch

After contracts (T039, T043, T048, T050) land, predicates and adapters at the same layer can run in parallel:
- Quota: T040, T041 in parallel
- Predicates: T042, T045, T046, T047 in parallel (after their adapter deps)

### Within US3 — CLI surface

T087, T088, T089, T090 are all `[P]` — different CLI command files.

---

## Implementation Strategy

1. **Phase 1 + Phase 2** in one sitting — small, mechanical.
2. **Ship US1 as v0.1.0**. Validate the full audit-trail + safety story against fixtures before adding anything else.
3. **Add US2** (resume + contention-safe pause) as v0.2.0. Validate via crash-and-resume integration test.
4. **Add US3** (daemon + suppression) as v0.3.0. This is the first version safe to leave running unattended for hours.
5. **Add US4** (human-in-the-loop) as v0.4.0. Run end-to-end against `~/ac/_tools/agent-remote` if available.
6. **Phase 7 polish** alongside each release; full polish before v1.0.0.

**Suggested MVP scope**: US1 only. The system is already useful as a single-shot dispatcher you invoke from cron or by hand.
