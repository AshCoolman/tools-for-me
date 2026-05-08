# Phase 0 Research — Token Smoulder

Open questions raised by the spec, with a decision and rationale for each. The
constitution's principles (especially II — Adapter Boundaries and IV — Conservative
Failure) are the tie-breakers.

## R1. Quota source — how to read remaining quota safely

**Decision**: Define a `QuotaSource` interface with two concrete implementations:
`claude-token-usage-fragile` (preferred when available) and `claude-token-simple`
(fallback). Both spawn the existing CLI tools as child processes, parse stdout JSON
through a `zod` schema, and return a typed `QuotaSnapshot { session: 0..1, week: 0..1,
sampledAt: Date }`. Failure to spawn or parse returns an explicit
`QuotaError(reason)` — never a default snapshot.

**Rationale**: The spec calls these tools out by path and warns "do not spread
tool-specific parsing throughout the codebase". A schema parse at the boundary is the
adapter's only job; everything inside is typed. Conservative failure (Principle IV)
forbids returning a fake "100% available" snapshot when the tool fails.

**Alternatives considered**:
- *Reading the quota file directly* — rejected; couples to internal tool layout.
- *HTTP poll of Anthropic's API* — rejected; networked, requires creds, breaks
  local-first constraint.

## R2. Contention detection — what counts as an "external active session"

**Decision**: V1 ships one `ContentionDetector`: `external-session-pid`. It enumerates
processes whose argv matches a configurable set of patterns (default:
`claude`, `cursor`, `code` running an interactive harness) and excludes processes
whose env contains `TOKEN_SMOULDER_OWNER=scheduler`. A session is "active" if any
matching process exists; "active for `<duration>`" is true if the dispatcher's
last-seen-active timestamp for any matching pid is within `<duration>`.

**Rationale**: Process inspection is local-only and adapter-isolated. Self-tagging via
env keeps scheduler-owned sessions from blocking themselves. Conservative failure: if
process enumeration errors, return `false` from the predicate.

**Alternatives considered**:
- *Window-focus / accessibility APIs* — rejected for v1; macOS-only, requires perms,
  out of scope.
- *Idle-time detection only* — rejected; doesn't catch "keyboard idle but agent
  running".

## R3. Risk classification — where does a `RiskClass` come from

**Decision**: `RiskClass` is declared inside each `executor.ts` via the
`executeAgentWork` factory's `riskClass` field. The mechanical rule:

- declared and valid → use it
- declared but not in the `RiskClass` enum → fail loud at executor load
- absent → `'destructive'` (gate blocks unconditionally)

The safety table lives in `core/predicates/risk.ts`:

| Class            | Allowed unattended without opt-in? | Notes |
|------------------|------------------------------------|-------|
| `readonly`       | yes                                | default allowlist member |
| `repo-local`     | yes                                | default allowlist member |
| `low-risk-write` | only if `safeRiskClass([...])` in the work unit's policy explicitly lists it | per-orchestration opt-in via the policy predicate |
| `networked`      | only via explicit `safeRiskClass([...])` opt-in AND the work unit's policy must include a positive contention/quota gate | |
| `destructive`    | never                              | unconditional block |
| `privileged`     | never                              | unconditional block |
| (unknown class)  | never                              | treated as `destructive` |

`low-risk-write` is therefore not a privileged class — it's an opt-in class. The
default unattended allowlist (`['readonly', 'repo-local']`) excludes it; a work unit
that wants its own writes treated as low-risk-write writes them into its own
`safeRiskClass([...])` call (see PM.md late-night example).

**Rationale**: A single mechanical rule for "where does the class come from"; a
single table for "what does each class permit". Per-orchestration opt-in keeps the
risk surface visible in `policy.ts` rather than hidden in core defaults.

**Alternatives considered**:
- *Centralised risk registry per orchestration name* — rejected; couples names to
  policy and drifts on rename.
- *Inferred from prompt content* — rejected; "prompt-only safety" is explicitly listed
  as an avoided pattern in the spec.
- *Heuristic defaults ("repo-local when repo-scoped")* — rejected; not mechanically
  defined, encourages drift between executor intent and gate behaviour.

## R4. Suppression-key shape and storage

**Decision**: Suppression key = SHA-256 over a JSON blob:
```
{ orchestrationName, workHash, executorHash, policyHash, failingPromptIndex, failureSignature }
```
Stored as one JSON file per key under `.orchestration-state/suppressions/<key>.json`
with `{ key, firstSeenAt, count, reason, clearedAt? }`. The dispatcher checks for an
unexpired, uncleared suppression before evaluating gates and emits
`run_suppressed` instead of running.

**Rationale**: The spec specifies the exact key inputs. SHA-256 gives a stable
filename; one file per key keeps writes append-only and `clear-suppression <id>` a
simple delete-or-mark.

**Alternatives considered**:
- *SQLite for suppression history* — rejected; violates "minimal dependencies" and
  "simple filesystem state".
- *In-memory suppression* — rejected; not restart-safe.

## R5. Locking — single-process file locks across restarts

**Decision**: Use exclusive file creation (`fs.open(path, 'wx')`) with the lock file
containing `{ pid, hostname, acquiredAt, owner }`. Stale-lock detection: if `pid` is
not alive (or `acquiredAt` older than 24h) the lock is considered stale and surfaces
via `lock_stale` event; clearing requires explicit `token-smoulder unlock <name>` or
`--global`. Two scopes: per-orchestration (`<name>.lock`) and optional global
(`global.lock`) when the daemon is configured for one-session-at-a-time.

**Rationale**: `wx` is atomic on POSIX filesystems; pid + hostname check covers crash
recovery. Explicit clear keeps "stale lock clearing must be explicit" from the spec.

**Alternatives considered**:
- *`proper-lockfile`* — rejected; extra dep, the abstraction is small enough to own.
- *flock(2) syscall* — rejected; portability + no obvious upside over `wx`.

## R6. Work parser — `work.md` sections

**Decision**: Hand-rolled small parser, ~30 lines, that splits on `^# ` headings and
collects body text verbatim until the next `^# `. Output is `{ sections: Map<string,
string> }`; `work.section(name)` returns the body or throws `MissingSectionError(name)`.
No CommonMark, no AST.

**Rationale**: The spec says "do not require a full markdown AST unless needed". The
test surface is small enough that a 30-line parser is more reviewable than a
markdown-it pipeline.

**Alternatives considered**:
- *`remark` / `markdown-it`* — rejected; pulls dozens of transitive deps for a
  feature that needs five lines of regex.

## R7. Agent adapter — Claude Code as the first impl

**Decision**: `AgentClient` interface is exactly the four methods in the spec. The
`claude-code.ts` adapter spawns `claude` CLI sessions with a sentinel arg
`--owner=scheduler` and the env var `TOKEN_SMOULDER_OWNER=scheduler` so the contention
detector can exclude them. Sessions are managed by pid; prompts are fed via stdin and
agent responses are captured via stdout JSONL streams. Status is derived from process
exit code + a final JSON event.

**Rationale**: The interface is small and stable. The adapter does CLI plumbing only;
no policy logic lives there. A second adapter (e.g. local OpenAI-compatible) only
needs to implement the same four methods.

**Alternatives considered**:
- *Direct Anthropic SDK calls* — rejected; bypasses Claude Code's session model and
  duplicates auth handling.
- *PTY-based screen-scraping* — rejected; brittle, harder to test.

## R8. Human-input channel — `agent-remote` first, terminal/file-inbox fallback

**Decision**: `HumanInputChannel` interface = `request({ orchestrationName, runId,
agentResponse, timeoutMs }) => Promise<string>`. Concrete impls in priority order:
`agent-remote` (uses `~/ac/_tools/agent-remote` if available) → `terminal` (uses
`@inquirer/prompts` when stdin is a TTY) → `file-inbox` (writes a request file under
`.orchestration-state/inbox/<runId>.req`, polls for `<runId>.res`). The dispatcher
selects the first available channel at startup; failure of the chosen channel is a
loud error, not a silent fall-through to the next.

**Rationale**: Spec lists the priority. Treating "channel mid-request fails" as loud
preserves Principle IV — fall-through there could deliver a stale answer to the
agent.

**Alternatives considered**:
- *Slack as required infrastructure* — rejected; explicitly listed as a non-goal.
- *Auto-cycling channels mid-request* — rejected; inconsistent answers + unclear
  audit trail.

## R9. Daemon loop — sleep cadence and shutdown

**Decision**: Daemon polls every 60s by default (configurable via
`TOKEN_SMOULDER_TICK_MS`). Each tick: `scan` valid orchestrations, evaluate each, run
at most one (per global lock if enabled). SIGINT/SIGTERM trigger graceful shutdown —
finish the in-flight prompt step, write `run_paused` event, release locks. No
exponential backoff, no jitter; if a tick takes >30s, log `tick_overran` and continue.

**Rationale**: The spec says "the daemon should be boring". A flat poll interval with
clear shutdown is simpler than scheduling and easier to reason about.

**Alternatives considered**:
- *Event-driven via filesystem watchers* — rejected for v1; watchers across NFS/iCloud
  are unreliable, and the policy gates need to re-evaluate even without file changes
  (quota or contention may shift).

## R10. Test strategy at adapter seams

**Decision**: Per Constitution Workflow rules, slice-integration tests dominate.
- Quota adapter: spawn against a fixture script that prints known JSON; assert parse
  + error path.
- Storage adapter: real `fs` against a `tmpdir`; assert lock + suppression + events
  semantics including a simulated crash.
- Agent adapter: replace the `claude` binary with a fixture script in `PATH` for the
  test; assert prompt feeding, stop on exit code, owner-tag visibility.
- Predicates: pure unit tests with injected `Clock` and adapter fakes from
  `tests/fixtures/`.
- Dispatcher: integration test with all adapters as fakes, asserting
  `DispatchDecision` reasons.

**Rationale**: Mock-the-unit-under-test is forbidden by the constitution. Adapter
seams are exactly where slice-integration earns its keep — the failure modes the
project worries about (quota tool changing format, lock crash recovery) only manifest
against a real filesystem or real subprocess.

**Alternatives considered**:
- *Heavy unit-mocking with `vi.mock`* — rejected per constitution + style guide.

## R11. Default values for timeouts and cooldowns

**Decision**:

| Constant                                      | Default                                                                              | Override                                                  |
|-----------------------------------------------|--------------------------------------------------------------------------------------|-----------------------------------------------------------|
| `HumanInputChannel.request` `timeoutMs`       | 30 minutes (1800000 ms)                                                              | per-call argument; env `TOKEN_SMOULDER_INPUT_TIMEOUT_MS`  |
| `SuppressionRecord.cooldownExpiresAt`         | `null` — suppression persists until `clear-suppression` is invoked or input files change | per-orchestration policy field (v2)                       |
| Daemon tick interval                          | 60 seconds                                                                           | `--tick=<ms>` flag; env `TOKEN_SMOULDER_TICK_MS`          |
| Tick overrun threshold (emits `tick_overran`) | 30 seconds                                                                           | env `TOKEN_SMOULDER_TICK_OVERRUN_MS`                      |
| Lock max age (`isLockStale`)                  | 24 hours                                                                             | env `TOKEN_SMOULDER_LOCK_MAX_AGE_MS`                      |
| Step grace period before SIGKILL on shutdown  | 60 seconds                                                                           | env `TOKEN_SMOULDER_SHUTDOWN_GRACE_MS`                    |

**Rationale**: One table, one source-of-truth file (`src/lib/env.ts`). Defaults
chosen for boring, conservative behaviour: 30m human-input window covers a meal or a
meeting; null suppression cooldown preserves the spec's "suppression manually
cleared" stance; 60s shutdown grace lets the in-flight prompt step finish without
forcing data loss.

## R12. FR-19 — "never auto-approve its own policy changes"

**Decision (v1)**: Detect-and-warn, do not gate.

- The dispatcher records `policyHash`, `workHash`, and `executorHash` on every
  `RunRecord`.
- On dispatch, if the latest run for the same orchestration has a different
  `policyHash` than the current `policy.ts`, the dispatcher emits a
  `policy_changed` event with `{ previousHash, currentHash }` *before* gate
  evaluation.
- The dispatcher does **not** block on policy change in v1. It surfaces the
  change in `events.ndjson` and in `state <name>` output.
- A future v2 may add `token-smoulder approve <name>` to write a baseline hash
  to `.orchestration-state/baselines/<name>.json` and refuse to dispatch until
  the current `policyHash` matches the baseline. v1 leaves this slot empty.

**Rationale**: The spec rule is "never auto-approve". v1 satisfies the spirit by
making every change visible (audit trail, no silent change). A blocking gate in v1
would force the user to run an `approve` command on first install, which has no
existing baseline to compare against — a chicken-and-egg the v2 design avoids by
distinguishing "no baseline yet" from "baseline differs".

**Required event addition**:
- `policy_changed` — added to the event list. Payload: `{ previousHash, currentHash }`.

**Alternatives considered**:
- *Block in v1* — rejected; the bootstrap UX is bad and offers no extra safety
  given runs already record the hashes.
- *Silent record without event* — rejected; violates Principle V (auditability).
