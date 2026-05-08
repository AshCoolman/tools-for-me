# Event Contract — `events.ndjson`

Each line is a JSON object matching the `Event` type from `storage.ts`. Append-only.
Event names are public contract; renames require MAJOR.

## Required event fields

```json
{
  "name": "<EventName>",
  "timestamp": "2026-05-06T20:00:00Z",
  "orchestrationName": "late-night",
  "runId": "01HXYZ...",
  "payload": { /* event-specific */ }
}
```

`orchestrationName` and `runId` are present when relevant; `payload` is event-specific
and free-form but documented per event below.

## Per-event payload shapes

### `orchestration_discovered`
```json
{ "name": "<orch>", "riskClass": "<RiskClass>" }
```

### `orchestration_invalid`
```json
{ "name": "<orch>", "missing": ["executor.ts"], "errors": [] }
```

### `policy_evaluated`
The full `DispatchDecision` shape under `payload.decision`.

### `dispatch_allowed` / `dispatch_blocked`
```json
{ "decisionId": "<ulid>", "reasons": [], "failedReasons": [] }
```

### `run_started`
```json
{ "runId": "<ulid>", "decision": { /* DispatchDecision */ } }
```

### `prompt_started` / `prompt_completed`
```json
{ "runId": "<ulid>", "stepIndex": 0, "prompt": "/speckit-specify", "durationMs": 12345 }
```

### `input_requested` / `input_received`
```json
{ "runId": "<ulid>", "channel": "terminal" | "agent-remote" | "file-inbox", "timeoutMs": 600000 }
```

### `run_paused` / `run_failed` / `run_completed`
```json
{ "runId": "<ulid>", "reason": "<short-string>", "failureSignature": "<hash>?" }
```

### `run_suppressed`
```json
{ "runId": "<ulid>", "suppressionKey": "<sha256>", "reason": "second identical failure" }
```

### `lock_acquired` / `lock_released` / `lock_stale`
```json
{ "scope": "global" | "orchestration", "name": "<orch>?", "pid": 12345 }
```

### `external_session_detected`
```json
{ "sessions": [{ "pid": 1234, "command": "claude" }] }
```

### `quota_insufficient`
```json
{ "scope": "session" | "week", "remaining": 0.18, "threshold": 0.25 }
```

### `tick_overran`
```json
{ "durationMs": 31200 }
```

### `policy_changed`
```json
{ "orchestrationName": "<orch>", "previousHash": "<sha256>", "currentHash": "<sha256>" }
```
Emitted before `policy_evaluated` when the current `policy.ts` hash differs from the
`policyHash` of the orchestration's most recent `RunRecord`. Informational only in
v1 — does not block dispatch.
