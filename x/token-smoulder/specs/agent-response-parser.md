# Spec: agent-response-parser

## Status
- **Phase:** done
- **Owner:** Ash
- **Created:** 2026-05-12
- **Last advanced:** 2026-05-12 by `/mini-speckit-next` (tasks → done)
- **Pillar:** stability
- **Effort budget when ready to build:** short

## Specify - WHAT and WHY
- **Problem:** `RESPONSE_SCHEMA` in `claude-code.ts` expects `{ text, needsInput }` but `claude -p --output-format json` returns `{ result, is_error, stop_reason, session_id, ... }`. Every run fails with `parse_error` because the fields don't exist. This is the single root cause behind the structured-output validation errors the playbook auto-captured.
- **Outcome:** The parser maps Claude CLI's actual JSON envelope to `AgentResponse`. Runs succeed when the agent returns valid output. Parse errors only fire for genuinely malformed responses.
- **Non-goals:**
  - Changing the `AgentResponse` interface — callers already depend on `{ text, needsInput }`
  - Handling streaming or multi-turn within a single `sendPrompt` call
- **Success criterion:**
  - A run that previously failed with `parse_error: text Required / needsInput Required` now completes
  - `needsInput` is `true` when `stop_reason` indicates the agent is waiting for input, `false` otherwise
- **Threat-model link:** non-coverage / DX-only
- **Constraints:**
  - Map `result` → `text`, derive `needsInput` from `stop_reason` (or `is_error`)
  - Keep the strict Zod parse — don't fall back to trusting arbitrary shapes
  - Preserve the `BoundaryError` path for genuinely broken output

## Plan - HOW

### Approach
Replace `RESPONSE_SCHEMA` with a Zod schema that matches the actual `claude --output-format json` envelope, then `.transform()` it into the existing `AgentResponse` shape. One file change, one test update, two fake-binary updates.

**CLI envelope** (observed):
```json
{ "type": "result", "subtype": "success", "is_error": false, "result": "...", "stop_reason": "end_turn", "session_id": "...", ... }
```

**Transform logic:**
- `result` → `text`
- `stop_reason !== 'end_turn'` → `needsInput: true`; `'end_turn'` → `needsInput: false`
- Pass through remaining fields as `metadata` (cost, usage, duration — useful for observability)

The Zod schema uses `.passthrough()` on the outer object so new CLI fields don't break parsing; the `.transform()` narrows it to `AgentResponse`.

### Surface
- `src/adapters/agent/claude-code.ts` — replace `RESPONSE_SCHEMA`
- `tests/integration/adapters/agent-claude-code.test.ts` — update fake binary output to match real CLI format
- `tests/e2e/fake-claude.sh` — same
- `tests/e2e/fake-claude-fail.sh` — no change (exits non-zero, no JSON)

### Files touched
- **Modified**: `src/adapters/agent/claude-code.ts`, `tests/integration/adapters/agent-claude-code.test.ts`, `tests/e2e/fake-claude.sh`

### Validation
- `npx vitest run tests/integration/adapters/agent-claude-code.test.ts` — passes with real CLI envelope
- `npx tsc --noEmit` — no type errors
- Manual: trigger a run via UI, confirm it no longer fails with `parse_error`

### Backward compatibility
- `AgentResponse` interface unchanged — callers see the same `{ text, needsInput, metadata? }` shape
- Fake binaries updated to emit real CLI format — tests exercise the actual parse path now

### Lock-in
- None. Zod schema tracks the CLI's output format; if the format changes, update the schema.

### Rollback
- Revert `claude-code.ts` to the old `RESPONSE_SCHEMA` and revert fake binaries

## Tasks

### Task 1: Replace RESPONSE_SCHEMA + update fake binaries
- **Files**: `src/adapters/agent/claude-code.ts`, `tests/e2e/fake-claude.sh`, `tests/integration/adapters/agent-claude-code.test.ts`
- **Success**: `RESPONSE_SCHEMA` parses the real `claude --output-format json` envelope (`{ result, is_error, stop_reason, ... }`) and transforms it to `AgentResponse` (`{ text, needsInput, metadata? }`). Fake binaries emit the real CLI JSON shape. `needsInput` is `true` when `stop_reason !== 'end_turn'`, `false` otherwise. Unknown fields don't break parsing.
- **Validation**: `npx vitest run tests/integration/adapters/agent-claude-code.test.ts` passes. `npx tsc --noEmit` passes.
- **Budget**: short

## Implement
- Task 1: d6769a2 — RESPONSE_SCHEMA + fake binaries aligned to real CLI envelope

## Notes / open questions
- Claude CLI JSON shape (observed): `{ type, subtype, is_error, result, stop_reason, session_id, duration_ms, ... }`
- `stop_reason: "end_turn"` → `needsInput: false`; other values (if any signal input-needed) → `needsInput: true`
- The `session_id` from the CLI response could also be captured if useful for session continuity
