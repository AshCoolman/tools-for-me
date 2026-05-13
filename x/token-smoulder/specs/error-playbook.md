# Spec: error-playbook

## Status
- **Phase:** done
- **Owner:** Ash
- **Created:** 2026-05-12
- **Last advanced:** 2026-05-13 by `/mini-speckit-next` (tasks → done)
- **Pillar:** DX / observability
- **Effort budget when ready to build:** medium

## Specify - WHAT and WHY
- **Problem:** Run failures surface raw error strings that are opaque to the operator. No interpretation, no remediation guidance, no learning. Every new error requires manual investigation from scratch.
- **Outcome:** A self-improving error playbook. When a run fails: (1) check a local playbook of discrete, reversible rules for a fuzzy match, (2) if matched, show human-readable explanation + remediation inline in the run detail, (3) if unmatched, send error + context to Claude for interpretation, auto-draft a new playbook rule (confirmed by default), (4) UI surfaces the interpretation and allows editing/deleting/disabling individual rules.
- **Non-goals:**
  - Auto-fixing errors (interpretation only, not remediation execution)
  - Replacing the raw error — always available alongside the interpretation
  - Complex ML matching — substring, regex, and normalized failure signatures are sufficient
- **Success criterion:**
  - A previously-unseen error triggers Claude interpretation and creates a playbook rule; the same error class on the next occurrence is matched locally without Claude
  - Any playbook rule can be individually disabled or deleted from the UI or by editing the playbook file
- **Threat-model link:** non-coverage / DX-only
- **Constraints:**
  - Rules must be discrete (one rule = one match + one explanation + one action) — no tangled multi-rule entries
  - Rules must be easily reversible — each can be disabled or deleted independently
  - New auto-drafted rules default to `confirmed: true` (operator trusts the system until a rule proves wrong)
  - Playbook is a single JSON file, human-editable
  - UI actions are optional per rule (highlight, banner, link, offer-clear-suppression, etc.)
  - Claude fallback is live from day one

## Plan - HOW

### Approach
Three layers: a playbook file (data), a matcher module (logic), and UI integration (display).

**Playbook file** — `{stateDir}/error-playbook.json`. Array of rule objects:
```ts
type PlaybookRule = {
  id: string;               // ulid
  match: { type: 'contains' | 'regex' | 'signature'; value: string };
  explanation: string;       // human-readable what-happened
  remediation: string;       // what to do about it
  uiAction?: { type: 'clear-suppression' | 'unlock' | 'link'; target?: string };
  enabled: boolean;          // toggle without deleting
  hits: number;              // how many times this rule matched
  createdAt: string;         // ISO
  source: 'claude' | 'manual';
};
```

**Matcher** — pure function, no side effects. Takes an error string + the playbook array, returns the first matching enabled rule or null. Match order: `signature` first (cheapest, most precise), then `contains`, then `regex`. Within a type, first match wins (array order).

**Claude fallback** — when no rule matches a failed run, send a one-shot prompt to `claude -p` with: raw error, orchestration name, gate results, step prompt. Parse the response into `explanation` + `remediation`. Auto-append a new rule with `match: { type: 'signature', value: normalizeFailureSignature(error) }` and `source: 'claude'`. Runs async — the current request returns the raw error immediately; the interpretation appears on next poll/refresh.

**Runner integration** — after `recordFailure()` in runner.ts, call the matcher. If no match, queue Claude interpretation. Store the interpretation result (matched rule id or pending) on the run record so the UI can display it.

**UI integration** — RunDetail shows the interpretation below the raw error when available. Each interpretation links to its rule. A new `/api/playbook` endpoint exposes CRUD for rules. No separate playbook management UI in v1 — rules are managed by editing the JSON file or via API.

### Surface
- `src/core/playbook.ts` — PlaybookRule type, `matchError()`, `loadPlaybook()`, `savePlaybook()`, `appendRule()`
- `src/core/runner.ts` — call matcher after failure, queue Claude fallback
- `src/cli/ui-server/handlers/playbook.ts` — GET/POST/PUT/DELETE `/api/playbook`
- `src/cli/ui.ts` — register playbook routes
- `src/cli/ui-assets/src/components/RunsPanel.tsx` — show interpretation in RunDetail
- `{stateDir}/error-playbook.json` — the playbook file

### Files touched
- **New**: `src/core/playbook.ts`, `src/cli/ui-server/handlers/playbook.ts`, `tests/unit/playbook.test.ts`
- **Modified**: `src/core/runner.ts`, `src/cli/ui.ts`, `src/cli/ui-assets/src/components/RunsPanel.tsx`, `src/adapters/storage/internal-types.ts` (add `interpretation` field to RunRecord)

### Validation
- Unit tests for matcher: contains, regex, signature match types; enabled/disabled toggle; first-match-wins ordering
- Unit test for Claude response parsing
- Integration test: run fails → playbook rule matches → interpretation stored on record
- Manual: trigger a failure in UI, verify interpretation renders below raw error

### Backward compatibility
- RunRecord gains optional `interpretation` field — old records simply lack it, no migration needed
- Playbook file is created on first write — no file = no rules = raw errors only (existing behavior)

### Lock-in
- None. Playbook is a plain JSON file. Claude fallback is a spawned CLI call, same pattern as existing agent. Removing the feature = delete the module + revert the runner call.

### Rollback
- Delete `src/core/playbook.ts`, `src/cli/ui-server/handlers/playbook.ts`, `tests/unit/playbook.test.ts`
- Revert runner.ts and RunsPanel.tsx changes
- Optional: delete `{stateDir}/error-playbook.json`

## Tasks

### Task 1: Playbook data model + matcher
- **Files**: `src/core/playbook.ts`, `tests/unit/playbook.test.ts`
- **Success**: `PlaybookRule` type exported. `matchError(error, rules)` returns the first matching enabled rule or null. `loadPlaybook(stateDir)` / `savePlaybook(stateDir, rules)` read/write JSON. `appendRule(stateDir, rule)` appends atomically.
- **Validation**: `npx vitest run tests/unit/playbook.test.ts` — covers contains, regex, signature match types; disabled rules skipped; first-match-wins; empty playbook returns null; malformed regex doesn't throw (skips rule).
- **Budget**: short

### Task 2: Runner integration — match on failure + store interpretation
- **Files**: `src/core/runner.ts`, `src/adapters/storage/internal-types.ts`
- **Success**: After a run fails, runner calls `matchError()` against the playbook. If matched, stores `{ ruleId, explanation, remediation }` on the run record as an optional `interpretation` field. If no match, `interpretation` is `{ ruleId: null, status: 'unmatched' }`. No Claude call yet (task 4).
- **Validation**: `npx vitest run` — existing tests still pass. New test: a run with a matching playbook rule has `interpretation.ruleId` set; a run with no match has `interpretation.status === 'unmatched'`.
- **Budget**: short

### Task 3: Playbook API endpoints
- **Files**: `src/cli/ui-server/handlers/playbook.ts`, `src/cli/ui.ts`
- **Success**: `GET /api/playbook` returns all rules. `POST /api/playbook` adds a rule (body = rule without id/hits/createdAt). `PUT /api/playbook/:id` updates a rule (toggle enabled, edit explanation/remediation). `DELETE /api/playbook/:id` removes a rule.
- **Validation**: `npx tsc --noEmit` passes. Manual curl test against running UI server.
- **Budget**: short

### Task 4: Claude fallback — interpret unmatched errors
- **Files**: `src/core/playbook.ts`, `src/core/runner.ts`
- **Success**: When `interpretation.status === 'unmatched'`, runner spawns `claude -p` with a structured prompt containing the error context. Parses the response into explanation + remediation. Appends a new playbook rule with `match: { type: 'signature', value: normalizeFailureSignature(error) }`, `source: 'claude'`, `enabled: true`. Updates the run record's interpretation with the new rule id. Runs async (does not block the failure path).
- **Validation**: `npx vitest run` — existing tests pass. Unit test with a mock agent: verify a rule is appended after Claude responds.
- **Budget**: short

### Task 5: UI — show interpretation in RunDetail
- **Files**: `src/cli/ui-assets/src/components/RunsPanel.tsx`, `src/cli/ui-assets/src/app.css`
- **Success**: When a failed run has `interpretation.explanation`, it renders below the raw error in RunDetail: explanation text + remediation hint. If `uiAction` is present, render the appropriate control (e.g. "clear suppression" button for `clear-suppression` action). Raw error always visible. Unmatched errors show no extra UI.
- **Validation**: `npx vite build` succeeds. Manual: expand a failed run with a playbook match, verify interpretation renders.
- **Budget**: short

## Implement
- Task 1: `4051722` — `src/core/playbook.ts` + `tests/unit/playbook.test.ts` — data model, matcher, I/O
- Task 2: `671b56a` — `src/core/runner.ts` + `src/adapters/storage/internal-types.ts` — match on failure, store interpretation
- Task 3: `4051722` — `src/cli/ui-server/handlers/playbook.ts` + `src/cli/ui.ts` — CRUD API endpoints
- Task 4: `4051722` — `src/core/playbook.ts` + `src/core/runner.ts` — Claude fallback (async interpret + auto-append rule)
- Task 5: `3fce2c2` — `src/cli/ui-assets/src/components/RunsPanel.tsx` + `src/cli/ui-assets/src/app.css` — render interpretation in RunDetail

## Notes / open questions
- Playbook location: `state/error-playbook.json` (lives alongside locks, runs, events)
- Match types to support: `contains`, `regex`, `signature` (normalized failure signature already used by suppression system)
- Consider hit-count tracking per rule for observability
- Claude context envelope: orchestration name, gate results, step prompt, raw error — enough to interpret without the full run history
