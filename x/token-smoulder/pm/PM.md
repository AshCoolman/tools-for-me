# Software Spec: Token Smoulder

## Purpose

Token Smoulder is a local, quota-aware work dispatcher.

It converts otherwise wasted AI-agent quota into durable engineering progress without interfering with human-driven work.

It is not primarily a scheduler.

It is a policy-driven dispatcher that answers:

> Is there safe, useful work that should run now, given current quota, contention, risk, and available tasks?

## Core Concept

The system dispatches work when four conditions align:

1. **Capacity** — enough unused quota exists.
2. **Contention** — no human-driven agent session is active.
3. **Value** — there is meaningful queued work.
4. **Risk** — the work is safe for unattended execution.

Clock time is only one input.

Quiet hours matter, but the system should not be modelled as “run at night.”

## Initial Filesystem Shape

A work unit lives under:

```text
./orchestration/<name>/
  policy.ts
  work.md
  executor.ts
```

Example:

```text
./orchestration/late-night/
  policy.ts
  work.md
  executor.ts
```

A folder is valid only when all three files exist.

## Example `policy.ts`

```ts
import {
  dispatchWhen,
  enoughQuota,
  noExternalActiveSessionsFor,
  timeWindow,
  queuedWorkExists,
  safeRiskClass,
  and,
  or,
} from '../src/policyUtils';

export const policy = dispatchWhen(() =>
  and([
    noExternalActiveSessionsFor('30m'),
    queuedWorkExists(),

    or([
      and([
        timeWindow('19:00-23:30'),
        enoughQuota('session'),
        enoughQuota('week'),
        safeRiskClass(['readonly', 'repo-local']),
      ]),

      and([
        timeWindow('23:30-04:00'),
        enoughQuota('week'),
        safeRiskClass(['readonly', 'repo-local', 'low-risk-write']),
      ]),
    ]),
  ]),
);
```

## Example `work.md`

```md
# Objective

Formalise the orchestration runner into a software spec.

# Context

This project should use spare AI quota during quiet periods without disrupting human work.

# Constraints

- local-first
- TypeScript
- no remote host control
- no destructive actions unattended
- must record state
- must avoid retry storms

# Done When

- spec exists
- plan exists
- tasks exist
- implementation is attempted
- failures are recorded clearly
```

## Example `executor.ts`

```ts
import { executeAgentWork } from '../src/executorUtils';
import { askHuman } from '../src/humanInput';

export const executor = executeAgentWork(({ work }) => ({
  objective: work.section('Objective'),
  context: work.section('Context'),
  constraints: work.section('Constraints'),

  promptFlow: [
    '/speckit.specify',
    '/speckit.plan',
    '/speckit.tasks',
    '/speckit.analyze',
    '/speckit.implement',
  ],

  onNeedInput: askHuman,

  stopConditions: [
    'human_input_required',
    'quota_exhausted',
    'external_session_detected',
    'fatal_error',
  ],
}));
```

## Dispatch Model

The dispatcher evaluates all valid orchestration folders.

For each work unit it computes:

```ts
type DispatchDecision = {
  shouldRun: boolean;
  orchestrationName: string;
  reasons: string[];
  failedReasons: string[];
  riskClass: RiskClass;
  selectedWorkHash: string;
};
```

A run starts only when `shouldRun === true`.

Failed gates are not errors.

They are recorded as skipped decisions.

## Policy Inputs

### Capacity

Capacity checks answer whether enough AI quota remains.

Initial predicates:

```ts
enoughQuota('session')
enoughQuota('week')
quotaRemainingAbove('week', 0.25)
quotaRemainingAbove('session', 0.20)
```

Capacity may initially read from existing local tools:

```text
~/ac/_tools/claude-token-usage-fragile
~/ac/_tools/claude-token-simple
```

The implementation should hide these behind an adapter.

Do not spread tool-specific parsing throughout the codebase.

### Contention

Contention checks answer whether automation would interfere with human activity.

Initial predicates:

```ts
noExternalActiveSessionsFor('30m')
keyboardIdleFor('15m')
notInMeeting()
onACPower()
```

Only `noExternalActiveSessionsFor` is required for v1.

If contention detection is uncertain, return false.

Conservative failure is correct.

### Value

Value checks answer whether there is useful work to do.

Initial predicates:

```ts
queuedWorkExists()
workFileChangedSinceLastRun()
previousRunIncomplete()
```

V1 may define value simply as:

- `work.md` exists
- selected section is non-empty
- current work hash has not already completed

### Risk

Risk checks answer whether unattended execution is acceptable.

Initial risk classes:

```ts
type RiskClass =
  | 'readonly'
  | 'repo-local'
  | 'low-risk-write'
  | 'networked'
  | 'destructive'
  | 'privileged';
```

Default unattended allowlist:

```ts
['readonly', 'repo-local']
```

Rules:

- `destructive` never runs unattended
- `privileged` never runs unattended
- `networked` requires explicit policy opt-in
- unknown risk defaults to blocked

## Execution Model

Execution is a resumable state machine.

Not just a loop over strings.

Minimum states:

```ts
type RunStatus =
  | 'queued'
  | 'skipped'
  | 'running'
  | 'paused'
  | 'failed'
  | 'completed'
  | 'suppressed';
```

Each prompt step is recorded.

```ts
type PromptStepState = {
  index: number;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  error?: string;
};
```

A run can resume from the first incomplete step.

## Agent Boundary

Do not hard-code Claude Code throughout the system.

Use an adapter:

```ts
type AgentClient = {
  startSession(args: {
    owner: 'scheduler';
    orchestrationName: string;
  }): Promise<AgentSession>;

  sendPrompt(args: {
    sessionId: string;
    prompt: string;
  }): Promise<AgentResponse>;

  getSessionStatus(args: {
    sessionId: string;
  }): Promise<AgentSessionStatus>;

  stopSession(args: {
    sessionId: string;
    reason: string;
  }): Promise<void>;
};
```

Claude Code can be the first adapter.

Future adapters may support:

- local OpenAI-compatible endpoints
- shell command runners
- other agent CLIs

## Human Input

If the agent requests input, the run pauses.

```ts
type HumanInputHandler = (args: {
  orchestrationName: string;
  runId: string;
  agentResponse: string;
}) => Promise<string>;
```

Initial implementation may use:

```text
~/ac/_tools/agent-remote
```

Fallbacks are acceptable:

1. terminal prompt
2. file inbox
3. fail clearly

The system must record:

- input requested
- input delivered
- timeout
- resumed
- failed

## Work Parser

`work.md` is parsed into named sections.

Required API:

```ts
work.section('Objective')
work.section('Context')
work.section('Constraints')
work.section('Done When')
```

Requirements:

- support `#` headings in v1
- preserve section body text
- fail clearly when a required section is missing
- do not require a full markdown AST unless needed

## State Storage

Use local filesystem state.

Suggested layout:

```text
.orchestration-state/
  events.ndjson
  locks/
    global.lock
    <orchestration>.lock
  runs/
    <orchestration>/
      latest.json
      <run-id>.json
  sessions/
    <session-id>.json
  suppressions/
    <suppression-id>.json
```

State must be durable across process restarts.

## Retry-Storm Protection

The dispatcher must not repeatedly run the same failing work.

Create a suppression key from:

```text
orchestration name
+ work.md hash
+ executor.ts hash
+ policy.ts hash
+ failing prompt index
+ normalized failure signature
```

If the same failure repeats twice, suppress future attempts until:

- input files change
- suppression is manually cleared
- a configured cooldown expires

Default behaviour:

- failed gate: skip
- first execution failure: record failed
- second same failure: suppress

## Locking

Rules:

- only one run per orchestration at a time
- optionally only one global scheduler-owned agent session
- stale locks must be detectable
- stale lock clearing must be explicit

CLI must provide:

```sh
token-smoulder unlock <name>
token-smoulder unlock --global
```

## CLI

Provide:

```sh
token-smoulder scan
token-smoulder list
token-smoulder check <name>
token-smoulder run <name> --once
token-smoulder daemon
token-smoulder state <name>
token-smoulder events
token-smoulder suppressions
token-smoulder clear-suppression <id>
token-smoulder unlock <name>
```

### `scan`

Detect valid and invalid orchestration folders.

### `list`

Show available work units.

### `check <name>`

Evaluate policy and print pass/fail reasons.

Must not start an agent session.

### `run <name> --once`

Evaluate policy and run once if allowed.

### `daemon`

Continuously evaluates policies.

The daemon should be boring:

- no overlapping runs
- clear logs
- graceful shutdown
- restart-safe state

### `state <name>`

Show latest run state.

### `events`

Print recent events from `events.ndjson`.

## Logging

Write structured JSONL events:

```text
.orchestration-state/events.ndjson
```

Required events:

```text
orchestration_discovered
orchestration_invalid
policy_evaluated
dispatch_allowed
dispatch_blocked
run_started
prompt_started
prompt_completed
input_requested
input_received
run_paused
run_failed
run_completed
run_suppressed
lock_acquired
lock_released
lock_stale
external_session_detected
quota_insufficient
```

Also print concise human-readable CLI output.

## Safety Rules

The system must never:

- run destructive work unattended
- execute on remote hosts
- treat remote host observations as authority
- bypass human sessions
- retry the same failing work forever
- silently ignore failed detection
- auto-approve its own policy changes

When unsure, do not run.

## Non-Goals

V1 does not include:

- web UI
- distributed workers
- multi-user auth
- Kubernetes-style controller
- complex cron syntax
- DAG workflow engine
- remote machine control
- Slack dependency as mandatory infrastructure
- cloud service dependency
- general-purpose CI replacement

## V1 Acceptance Criteria

V1 is complete when:

1. `token-smoulder scan` detects valid orchestration folders.
2. `token-smoulder check <name>` explains dispatch decisions.
3. `token-smoulder run <name> --once` runs only when policy passes.
4. External human sessions block unattended work.
5. Quota checks are adapter-based.
6. `work.md` sections can be injected into prompts.
7. Prompt flow runs step-by-step.
8. Runs can pause for human input.
9. Run state survives restart.
10. Same failing work is not retried indefinitely.
11. Logs are written to `events.ndjson`.
12. The whole system remains understandable from:
    - `policy.ts`
    - `work.md`
    - `executor.ts`

## Design Bias

Prefer:

- TypeScript
- explicit adapters
- simple filesystem state
- conservative gates
- minimal dependencies
- clear failure messages
- resumable execution
- small composable predicates

Avoid:

- clever workflow frameworks
- hidden global state
- broad plugin systems
- cron-first design
- remote-control architecture
- prompt-only safety
- optimistic execution when uncertain

## Summary

Token Smoulder is a local dispatcher for turning spare AI quota into useful work.

It should run only when there is enough quota, low contention, worthwhile work, and acceptable risk.

The elegant core is:

```ts
dispatchWhen({
  capacity: enoughQuota(),
  contention: noHumanSession(),
  value: worthwhileWorkExists(),
  risk: safeToRun(),
});
```

Not:

```ts
runEvery('30m', doStuff);
```

Time is an input.

Policy is the product.
