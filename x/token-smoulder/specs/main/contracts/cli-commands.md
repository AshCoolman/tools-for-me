# CLI Contract — `token-smoulder`

The CLI is a public contract (per Constitution Architectural Constraints). Any rename
or shape change requires a MAJOR bump.

All commands exit 0 on success. Non-zero exit codes:
- `1` — generic failure
- `2` — invalid arguments / missing folder
- `3` — gate failed (for `run --once` when policy blocks)
- `4` — lock contention
- `5` — boundary error (quota tool, agent CLI, filesystem)

All commands accept `--json` to emit structured output to stdout. Without `--json`,
output is concise human-readable text.

## `token-smoulder scan`

Detect valid and invalid orchestration folders under `./orchestration/`.

**Output**:
```json
{
  "valid": [{ "name": "late-night", "riskClass": "low-risk-write" }],
  "invalid": [{ "name": "broken", "missing": ["executor.ts"] }]
}
```

## `token-smoulder list`

Show available work units (valid orchestrations only) with their declared risk class
and current state if any.

## `token-smoulder check <name>`

Evaluate the policy for `<name>` and print pass/fail reasons.

**Must not start an agent session.** Exits 0 whether the policy passes or fails (use
`--strict` to exit 3 on fail for scripting).

**Output**:
```json
{
  "orchestrationName": "late-night",
  "shouldRun": false,
  "reasons": ["queuedWorkExists", "noExternalActiveSessionsFor(30m)"],
  "failedReasons": ["enoughQuota(week): remaining 0.18 below threshold 0.25"],
  "riskClass": "low-risk-write",
  "selectedWorkHash": "ab12...",
  "evaluatedAt": "2026-05-06T20:00:00Z"
}
```

## `token-smoulder run <name> --once`

Evaluate policy for `<name>`. If `shouldRun === true`, acquire the lock and execute
the prompt flow. Exits 0 on completion, 3 on gate failure, 4 on lock contention, 5
on boundary error.

Flags:
- `--once` (required) — runs exactly one dispatch cycle for the named work
- `--resume` — resume a previously paused/failed run from the first incomplete step
- `--dry-run` — prints what would be executed; does not start a session

## `token-smoulder daemon`

Continuously evaluate policies. SIGINT / SIGTERM trigger graceful shutdown.

Flags:
- `--global-lock` — only one scheduler-owned agent session at a time across all
  orchestrations
- `--tick=<ms>` — override poll interval (default 60000)

## `token-smoulder state <name>`

Print the latest run record for `<name>` (reads `runs/<name>/latest.json`).

## `token-smoulder events [--since=<duration>] [--type=<event>]`

Print recent events from `events.ndjson`. Default: last 100 lines.

## `token-smoulder suppressions`

List active suppressions.

## `token-smoulder clear-suppression <id>`

Mark a suppression cleared (sets `clearedAt`). The suppression no longer blocks
dispatch.

## `token-smoulder unlock <name>` / `token-smoulder unlock --global`

Explicitly clear a lock. Refuses to clear if the lock's pid is alive unless
`--force` is passed; `--force` requires confirmation on a TTY.
