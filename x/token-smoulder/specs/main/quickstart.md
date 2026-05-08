# Quickstart — Token Smoulder

Get from zero to a green `check` on a fixture orchestration in five minutes.

## Prerequisites

- Node `>=20`
- macOS or Linux
- (optional) `~/ac/_tools/claude-token-simple` on `PATH` for real quota readings
- (optional) `claude` CLI on `PATH` for real agent runs

## Install (once src/ is implemented)

From the repo root (`x/token-smoulder/`):

```sh
yarn install
yarn build
```

The CLI is exposed as `bin/token-smoulder` (added in tasks T002).

## 1. Create a work unit

```sh
mkdir -p orchestration/hello
```

`orchestration/hello/policy.ts`:
```ts
import { dispatchWhen, and, queuedWorkExists, safeRiskClass } from '../../src/core/predicates/compose';

export const policy = dispatchWhen(() =>
  and([
    queuedWorkExists(),
    safeRiskClass(['readonly']),
  ]),
);
```

`orchestration/hello/work.md`:
```md
# Objective

Print "hello world" via the agent.

# Context

Quickstart smoke test.

# Constraints

- readonly
- no filesystem writes

# Done When

- agent acknowledges the prompt
```

`orchestration/hello/executor.ts`:
```ts
import { executeAgentWork } from '../../src/core/runner';

export const executor = executeAgentWork(({ work }) => ({
  riskClass: 'readonly',
  objective: work.section('Objective'),
  context: work.section('Context'),
  constraints: work.section('Constraints'),
  promptFlow: ['/help'],
  stopConditions: ['fatal_error'],
}));
```

## 2. Verify it scans

```sh
token-smoulder scan
```

Expected:
```json
{ "valid": [{ "name": "hello", "riskClass": "readonly" }], "invalid": [] }
```

## 3. Check the policy

```sh
token-smoulder check hello
```

A passing decision prints `shouldRun: true` with `reasons` listing
`queuedWorkExists`, `safeRiskClass([readonly])`. `check` does not start an agent.

## 4. Run once

```sh
token-smoulder run hello --once
```

This acquires `.orchestration-state/locks/hello.lock`, opens an agent session,
sends `/help`, records steps in `runs/hello/<run-id>.json`, and appends events to
`events.ndjson`.

## 5. Inspect state and events

```sh
token-smoulder state hello
token-smoulder events --since=10m
```

## 6. Daemon mode

```sh
token-smoulder daemon --tick=60000
```

Polls every 60s. SIGINT triggers graceful shutdown (finishes the in-flight prompt
step, writes `run_paused`, releases locks).

## 7. Recover from a stuck lock

```sh
token-smoulder unlock hello             # refuses if pid alive
token-smoulder unlock hello --force     # confirms then clears
```

## 8. Clear a suppression

```sh
token-smoulder suppressions
token-smoulder clear-suppression <key>
```

## Troubleshooting

- `boundary error: claude-token-simple exited 127` — quota CLI missing on `PATH`. Install or
  switch `QuotaSource` config to `claude-token-usage-fragile`.
- `dispatch_blocked: noExternalActiveSessionsFor(30m)` — close interactive `claude` /
  `cursor` / `code` agent sessions, or wait 30 minutes.
- `dispatch_blocked: enoughQuota(week)` — week budget below threshold; check with the
  upstream quota tool directly.
