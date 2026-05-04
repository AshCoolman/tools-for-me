# Spec: <name>

> **mini-speckit single-file spec.** Lightweight alternative to GitHub Spec Kit. Suitable for trivially small, single-doc deliverables. Walked by `/spec-next-mini` or the Codex `mini-speckit` skill. Phases: `specify` -> `plan` -> `tasks` -> `implement` -> `done` -> `blocked`.

## Status

- **Phase:** specify | plan | tasks | implement | done | **blocked**
- **Owner:** Name (role)
- **Created:** YYYY-MM-DD
- **Last advanced:** YYYY-MM-DD by `<command or person>`
- **Pillar:** _(optional - use whatever taxonomy your repo uses; e.g. `feature | infra | docs | cross-cutting`. Delete the field if your repo has none.)_
- **Effort budget when ready to build:** short | medium | long
- **Blocked on:** _(only when Phase=blocked - name the external dependency: vendor research, legal review, vetting question ID, etc. The workflow will skip blocked specs.)_

## Specify - WHAT and WHY

- **Problem:** what is broken / missing / risky in one paragraph.
- **Outcome:** the visible end state once shipped, in one paragraph.
- **Non-goals:** what this spec deliberately will not do.
- **Success criterion:** one or two verifiable assertions a third party can check.
- **Threat-model link:** which T-vector(s) it addresses, or `non-coverage / DX-only`.
- **Constraints:** must / must-not / nice-to-have.

## Plan - HOW

_(Fill when phase advances from `specify` to `plan`. Until then, leave the bullets but mark `_(pending)_`.)_

- **Approach:** the chosen design in 3-5 sentences. Name alternatives considered and why rejected.
- **Surface:** every new command, agent, flag, hook, env var, install path, MCP allowance. Name them with input/output shapes.
- **Files to add/modify:** explicit paths, grouped by pillar.
- **Validation matrix:** what command/check verifies each part.
- **Backward-compat:** managed install upgrade path; project-baseline upgrade path; user impact.
- **Lock-in:** external deps introduced; install changes; contracts future work must honour.
- **Rollback:** what to revert, in what order; how to verify the revert.

## Tasks

_(Fill when phase advances from `plan` to `tasks`. Each task is independently shippable under whatever runner the repo has configured - see `mini-speckit/HANDOFF.md`.)_

- [ ] **T1 - <title>** - files: `...`. Success: `...`. Validation: `...`.
- [ ] **T2 - <title>** - files: `...`. Success: `...`. Validation: `...`.
- [ ] **T3 - <title>** - files: `...`. Success: `...`. Validation: `...`.

## Implement

_(SHA log; populate as tasks ship.)_

- T1 -> `<sha>` (YYYY-MM-DD)
- T2 -> `<sha>` (YYYY-MM-DD)

## Notes / open questions

_(Optional. Use to log questions surfaced during a phase that don't block the current phase but must be answered before the next.)_

- _(none)_
