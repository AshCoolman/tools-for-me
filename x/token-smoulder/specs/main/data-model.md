# Phase 1 Data Model — Token Smoulder

All persisted shapes live on the local filesystem. Validation is performed by `zod`
schemas at every boundary read; types are derived (`z.infer`) so there's a single
source of truth.

## On-disk layout

```text
.orchestration-state/
├── events.ndjson                         # append-only structured event log
├── locks/
│   ├── global.lock                       # optional global single-session lock
│   └── <orchestration>.lock              # per-orchestration lock
├── runs/
│   └── <orchestration>/
│       ├── latest.json                   # pointer to the most recent run record
│       └── <run-id>.json                 # one run record per run
├── sessions/
│   └── <session-id>.json                 # AgentClient session metadata
├── suppressions/
│   └── <suppression-key>.json            # one file per suppression
└── inbox/                                # human-input file-inbox channel only
    ├── <run-id>.req
    └── <run-id>.res
```

## Core types

### `RiskClass`

```ts
type RiskClass =
  | 'readonly'
  | 'repo-local'
  | 'low-risk-write'
  | 'networked'
  | 'destructive'
  | 'privileged';
```

Default unattended allowlist: `['readonly', 'repo-local']`. Unknown class →
`'destructive'` (blocked).

### `RunStatus`

```ts
type RunStatus =
  | 'queued'      // selected by scan but not yet started
  | 'skipped'     // a gate failed
  | 'running'     // active prompt step in flight
  | 'paused'      // awaiting human input
  | 'failed'      // execution failure (recorded, may be retried once)
  | 'completed'   // all prompt steps finished
  | 'suppressed'; // suppression-key match blocked dispatch
```

State transitions:
```
queued → running → completed
queued → skipped
queued → suppressed
running → paused → running
running → failed → suppressed (after 2nd identical failure)
running → completed
```

### `PromptStepState`

```ts
type PromptStepState = {
  index: number;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;   // ISO 8601
  completedAt?: string; // ISO 8601
  error?: string;       // present when status === 'failed'
};
```

### `RunRecord`

```ts
type RunRecord = {
  runId: string;                       // ULID
  orchestrationName: string;
  status: RunStatus;
  riskClass: RiskClass;
  workHash: string;                    // SHA-256 of work.md
  policyHash: string;                  // SHA-256 of policy.ts source
  executorHash: string;                // SHA-256 of executor.ts source
  startedAt: string;                   // ISO 8601
  endedAt?: string;
  steps: PromptStepState[];
  sessionId?: string;                  // AgentClient session
  failureSignature?: string;           // normalized failure for suppression
  decision: DispatchDecision;          // the gating decision that allowed this run
};
```

### `DispatchDecision`

```ts
type DispatchDecision = {
  shouldRun: boolean;
  orchestrationName: string;
  reasons: string[];                   // predicates that PASSED
  failedReasons: string[];             // predicates that FAILED, with cause
  riskClass: RiskClass;
  selectedWorkHash: string;
  evaluatedAt: string;                 // ISO 8601
};
```

### `PredicateResult`

```ts
type PredicateResult =
  | { ok: true; reason: string }
  | { ok: false; reason: string };     // includes uncertainty: returns ok:false
```

A `Predicate` is `() => Promise<PredicateResult>`. Composition:
```ts
type Predicate = () => Promise<PredicateResult>;
const and = (preds: Predicate[]): Predicate => /* short-circuit on first false */
const or  = (preds: Predicate[]): Predicate => /* short-circuit on first true  */
```

### `SuppressionRecord`

```ts
type SuppressionRecord = {
  key: string;                         // SHA-256 of the input blob
  orchestrationName: string;
  workHash: string;
  policyHash: string;
  executorHash: string;
  failingPromptIndex: number;
  failureSignature: string;
  firstSeenAt: string;
  count: number;
  reason: string;
  cooldownExpiresAt?: string;          // optional configured cooldown
  clearedAt?: string;                  // present after clear-suppression
};
```

### `LockFile`

```ts
type LockFile = {
  pid: number;
  hostname: string;
  acquiredAt: string;
  owner: 'scheduler' | string;
  scope: 'global' | 'orchestration';
  orchestrationName?: string;          // present iff scope === 'orchestration'
};
```

A lock is **stale** when:
- `process.kill(pid, 0)` reports no such process, OR
- `acquiredAt` is older than 24 hours (configurable via
  `TOKEN_SMOULDER_LOCK_MAX_AGE_MS`).

### `QuotaSnapshot`

```ts
type QuotaSnapshot = {
  session: number;                     // 0..1 fraction remaining
  week: number;                        // 0..1 fraction remaining
  sampledAt: string;                   // ISO 8601
  source: 'claude-token-usage-fragile' | 'claude-token-simple';
};
```

### `AgentSession` / `AgentResponse` / `AgentSessionStatus`

```ts
type AgentSession = {
  sessionId: string;
  startedAt: string;
  owner: 'scheduler';
  orchestrationName: string;
  pid?: number;
};

type AgentResponse = {
  text: string;
  needsInput: boolean;                 // true if the agent paused for human input
  metadata?: Record<string, unknown>;
};

type AgentSessionStatus =
  | 'starting'
  | 'idle'
  | 'thinking'
  | 'awaiting_input'
  | 'completed'
  | 'failed';
```

## Work unit on disk

```text
orchestration/<name>/
├── policy.ts          # exports `policy: Predicate`
├── work.md            # parsed for sections
└── executor.ts        # exports `executor: Executor`
```

A folder is **valid** iff all three files exist and import successfully. Invalid
folders are reported by `scan` with the missing/erroring file named.

## Validation rules

- `RiskClass` is parsed by a `zod` enum; unknown strings fail validation and the
  declared risk falls back to `'destructive'` (blocked).
- `RunRecord.steps` is non-empty; `index` starts at 0 and is contiguous.
- `SuppressionRecord.count >= 2` is the threshold for active suppression
  (first failure records, second failure activates).
- All ISO 8601 timestamps are validated and stored in UTC.
- Hashes are 64-hex-char SHA-256 (validated by zod regex).
