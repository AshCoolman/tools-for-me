# Scenarios — Token Smoulder

Behaviour the spec enables, in Given/When/Then form. Each scenario is independently
testable and corresponds to events in `events.ndjson`.

## S1 — Quiet evening, spare quota becomes progress

**Given** a valid `orchestration/late-night/` work unit with `riskClass: 'low-risk-write'`
**And** week quota at 0.62 and session quota at 0.80
**And** no `claude` or `cursor` process has been active for 35 minutes
**When** the daemon ticks at 22:10
**Then** the dispatcher emits `dispatch_allowed`, acquires the lock, opens a scheduler-
owned agent session, and walks the prompt flow step by step.

## S2 — Human returns mid-run

**Given** a run is `running` for `late-night`
**When** the user opens an interactive `claude` session
**Then** the next contention check returns true on the next prompt-step boundary
**And** the runner stops the session with reason `external_session_detected`,
emits `run_paused`, and the lock is released. The run resumes from the first
incomplete step on the next allowed dispatch.

## S3 — Quota dip blocks dispatch

**Given** week quota is 0.18 and the policy requires `quotaRemainingAbove('week', 0.25)`
**When** `token-smoulder check late-night` runs
**Then** the output lists `enoughQuota(week): remaining 0.18 below threshold 0.25` under
`failedReasons` with `shouldRun: false`. No agent session is started.

## S4 — Repeated failure triggers suppression

**Given** the same work + policy + executor hashes have already failed once at prompt
step 2 with failure signature `parse_error:line_5`
**When** the same configuration fails again at the same step with the same signature
**Then** the dispatcher writes a `SuppressionRecord` (count=2) and emits
`run_suppressed` on subsequent dispatches until the inputs change or
`clear-suppression` is run.

## S5 — Crash recovery

**Given** a run record exists with two completed steps and a third `running` step
**And** the process was killed
**When** the daemon next ticks and the lock is detected stale (pid not alive)
**Then** `lock_stale` is emitted and dispatch waits for explicit `unlock`. After
unlock, the next allowed dispatch resumes from step 3 — completed steps are not
re-run.

## S6 — Destructive work is never run unattended

**Given** an executor declares `riskClass: 'destructive'`
**When** the policy is evaluated for any time window
**Then** `safeRiskClass` returns false, dispatch is blocked, and the failed reason
names the disallowed class. No override flag exists in v1.

## S7 — One-line idea becomes a ready-to-dispatch work unit

**Given** the user has a one-line idea (e.g. `"tidy our test fixtures: drop
unused files and normalise headers"`)
**When** they run `token-smoulder new <name> "<one-liner>"`
**Then** the CLI scaffolds `orchestration/<name>/` containing:
- `work.md` with `Objective` (the one-liner, verbatim), `Context`, `Constraints`,
  and `Done When` sections; the latter three are seeded with TODO markers the
  user must fill in.
- `policy.ts` exporting a default-safe policy:
  `and([queuedWorkExists(...), safeRiskClass(['readonly'])])`.
- `executor.ts` exporting an `executor` whose `riskClass` is `'readonly'`,
  whose `objective`/`context`/`constraints` read from `work.section(...)`,
  and whose `promptFlow` is a single TODO step the user must replace.

**And** `token-smoulder scan` immediately lists the new folder under `valid`.
**And** `token-smoulder check <name>` returns `shouldRun: false` with a
`failedReasons` entry from the `noTodoSentinels` predicate naming the
sections that still contain `TODO(token-smoulder)` markers (typically
`Context`, `Constraints`, `Done When`).
**And** `token-smoulder lint <name>` exits 3 with a list of unmet rubric
items: TODO sentinels still present, `Done When` empty, and `promptFlow`
still set to the placeholder.
**And** once the user replaces the TODOs (Done When written in the small
`file:` / `exit:` / `match:` grammar; promptFlow filled with concrete
prompts), `lint` exits 0 and `check` flips to `shouldRun: true` — the work
unit is ready for `run --once` or daemon dispatch with no further wiring.

The intent is to keep the path from idea → ready short and obvious: one
command produces a valid scaffold; the user (helped by the
`token-smoulder-flesh-out-work` skill) only edits prose and the prompt
flow, never the dispatcher wiring.
