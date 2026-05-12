<!--
SYNC IMPACT REPORT
Version change: (template) → 1.0.0
Bump rationale: Initial ratification of the Token Smoulder constitution.
Modified principles:
  - [PRINCIPLE_1_NAME] → I. Policy-Driven Dispatch
  - [PRINCIPLE_2_NAME] → II. Adapter Boundaries
  - [PRINCIPLE_3_NAME] → III. Composable Predicates Over Frameworks
  - [PRINCIPLE_4_NAME] → IV. Conservative Failure
  - [PRINCIPLE_5_NAME] → V. Resumable, Auditable State
Added sections:
  - Architectural Constraints
  - Development Workflow
Removed sections: none
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check now satisfied by gates below)
  - ✅ .specify/templates/spec-template.md (no scope changes required)
  - ✅ .specify/templates/tasks-template.md (no task-category changes required)
  - ✅ .claude/skills/speckit-constitution (this command file unchanged)
Follow-up TODOs: none
-->

# Token Smoulder Constitution

## Core Principles

### I. Policy-Driven Dispatch

Dispatch is governed by four gates: **Capacity**, **Contention**, **Value**, **Risk**.
Every run decision MUST enumerate the predicates that passed and failed. Time is one
input, never the product. A run starts only when `shouldRun === true` after all four
gates evaluate; a failed gate is a recorded skip, not an error.

**Rationale**: The system exists to convert spare quota into useful work without
disturbing humans. A clock-based scheduler cannot express that constraint; a policy
composed of capacity, contention, value, and risk predicates can.

### II. Adapter Boundaries

External systems sit behind small, named adapters: `AgentClient`, quota source,
human-input channel, clock, filesystem. Tool-specific parsing (e.g.
`claude-token-usage-fragile`, `agent-remote`) MUST NOT leak into dispatch, policy,
or executor code. Adding a new agent runner, quota source, or input channel MUST be
possible without modifying core logic.

**Rationale**: Boundary discipline is the separation-of-concerns guarantee. The
project will outlive any single CLI or quota tool; the core must remain replaceable
underneath.

### III. Composable Predicates Over Frameworks

Capacity, contention, value, and risk checks are small pure functions composed with
`and` / `or`. The system MUST NOT introduce workflow engines, DAG runners, plugin
registries, or generic config loaders. New predicates extend the system by addition,
not modification of existing predicates.

**Rationale**: The elegant core of the spec — `dispatchWhen({ capacity, contention,
value, risk })` — only stays elegant if predicates remain the unit of extension.
Frameworks invert that and bury policy in machinery.

### IV. Conservative Failure

When a predicate cannot determine its answer, it MUST return `false`. Unknown risk
classes are blocked. Detection ambiguity never authorises execution. Errors at
external boundaries (quota tools, agent CLIs, filesystem, human-input) MUST be loud:
preserve the endpoint, arguments, status/exit code, and original message. No empty
catches, no `?? defaultValue` after a real failure, no silent fallbacks. Caught errors
must be reported, converted to an error state, rethrown, or explicitly ignored with a
written reason.

**Rationale**: Unattended automation that "tries anyway" causes the exact damage this
project is built to avoid. Loud failure surfaces real causes; silent fallback hides
them.

### V. Resumable, Auditable State

All run state lives on the local filesystem and MUST survive process restarts. Every
dispatch decision, prompt step, lock event, suppression, and human-input transition
MUST be appended to `.orchestration-state/events.ndjson` as a structured record.
Runs MUST resume from the first incomplete prompt step. Suppression keys MUST combine
orchestration name, work hash, executor hash, policy hash, failing prompt index, and
normalized failure signature, so identical failure twice halts retry until inputs
change or suppression is cleared.

**Rationale**: The system is unattended; the audit trail is the only post-hoc
explanation. Resumability is non-optional because crashes are routine and re-running
from scratch can be unsafe.

## Architectural Constraints

**Language and runtime**: TypeScript, strict mode, Node `>=20`, ESM. No transitive
loosening of `tsconfig` strictness for convenience.

**Dependencies**: Minimal. A new runtime dependency requires a one-line justification
in the PR description naming what it replaces or unblocks. Dev dependencies follow
the same rule with a lower bar.

**Filesystem layout**: A work unit is a folder under `./orchestration/<name>/`
containing exactly `policy.ts`, `work.md`, and `executor.ts`. A folder missing any
of the three is invalid and MUST be reported by `token-smoulder scan`, not silently
ignored. Run state lives under `.orchestration-state/` per the spec.

**Adapter layout**: Each external boundary lives in its own directory or file under
`src/adapters/<name>/` exposing a typed interface. Core code imports the interface,
never the implementation. Tests substitute fakes at the interface.

**Type derivation**: Domain types are derived (`z.infer`, `Pick`, `Omit`,
`ReturnType`, indexed access) wherever possible. Hand-duplicating an external
shape is forbidden when a derivation is available.

**Public contracts**: Exported types, the CLI command surface, the
`.orchestration-state/` schema, event names in `events.ndjson`, and the
`./orchestration/<name>/` folder shape are public contracts. Renames or shape
changes require a MAJOR version bump per the Governance section.

## Development Workflow

**Test-first for production code**: Code under `src/**` and `scripts/**` is added
test-first. A new function or method MUST land with at least one failing test that
becomes green when the function is implemented. Throwaway prototypes are exempt only
when explicitly flagged as such in the PR.

**Integration over mocks at adapter seams**: Adapter behaviour is verified by
slice-integration tests that exercise the adapter against a real or fake-but-real
counterpart. Unit-mocking the adapter under test is forbidden.

**Closed-loop verification**: Any change to dispatch, policy, executor, or state
machine code MUST declare one mechanical PASS/FAIL stop condition before the first
edit, confirm it currently FAILS, and re-run to confirm it PASSES after the edit.

**Style and provenance**: The active code style is
`.dev/docs/code-style.md` (repo root). Notable rules: do not
swallow errors, preserve async semantics, treat `JSON.parse`/`fetch`/SDK calls as
fallible boundaries, do not rename values as they cross boundaries, no collector
barrels in app code.

**Review gates**: Every PR MUST be checked against the five Core Principles. A PR
that adds a workflow framework, plugin registry, generic config loader, hidden global
state, or cron-first scheduling code is rejected unless the Complexity Tracking
section of `plan.md` justifies the violation.

## Governance

This constitution supersedes ad-hoc convention. Where it conflicts with default
project scaffolding (`.specify/templates/*`), the constitution wins and the template
MUST be updated.

**Amendment procedure**: Amendments are proposed by editing this file in a PR.
The PR MUST include the Sync Impact Report (the HTML comment at the top of this
file) and update any dependent template flagged in that report. Approval requires
the project owner.

**Versioning policy**: Semantic versioning applied to governance content.
- **MAJOR**: A principle is removed, redefined incompatibly, or a public contract
  named in Architectural Constraints changes shape.
- **MINOR**: A new principle or section is added, or existing guidance is materially
  expanded.
- **PATCH**: Wording, clarifications, typo fixes, non-semantic refinements.

**Compliance review**: At each `/speckit-plan` run, the Constitution Check gate
evaluates the proposed plan against the five Core Principles. Violations are listed
in the plan's Complexity Tracking table with a written justification or the plan is
revised. Runtime style guidance lives at
`.dev/docs/code-style.md` (repo root).

**Version**: 1.0.0 | **Ratified**: 2026-05-03 | **Last Amended**: 2026-05-03
