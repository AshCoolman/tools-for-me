# Spec: web-ui-clarity

## Status
- **Phase:** done
- **Owner:** Ash
- **Created:** 2026-05-10
- **Last advanced:** 2026-05-10 by `/mini-speckit-next` (tasks → done)
- **Pillar:** DX
- **Effort budget when ready to build:** medium

## Specify - WHAT and WHY
- **Problem:** The web UI shows status labels ("failed") with no path to investigate them. Run records contain the answer (error messages, step progress, decision reasons, failure signatures) but nothing in the UI fetches or renders them. Event tail only shows live SSE events since page load, so failures that happened before opening the page are invisible. Header controls (quota bars, external dot, daemon tick input) are unlabeled and opaque to new users. Raw IDs (26-char ULID runIds, 64-char SHA-256 hashes) are shown without truncation or context.
- **Outcome:**
  - Clicking a unit with status "failed" immediately shows why it failed: error message, step-by-step progress, and dispatch reasons.
  - RunIds and hashes are truncated to short forms with full values available on hover.
  - Event tail seeds from recent history on mount (not just live SSE).
  - Header controls are labeled so a new user can understand what they gate.
- **Non-goals:**
  - Full run-history browser (only latest run per unit).
  - Redesigning the add-unit / source-shelf / verdict flows.
  - Auth, multi-user, or remote access.
- **Success criterion:**
  - A user opening the UI for the first time can identify a failed unit and read its error message within two clicks (select unit -> see error).
  - No raw 26+ char IDs visible at default zoom; short forms only, full on hover.
- **Threat-model link:** non-coverage / DX-only
- **Constraints:**
  - Must use existing `GET /api/units/:name/state` endpoint (returns full RunRecord).
  - Must use existing `GET /api/events` endpoint for historical seed.
  - No new npm dependencies.
  - Keep the detail panel layout stable for the work-editor and event-tail components already shipped in `specs/web-ui.md`.

## Plan - HOW

### Approach

Four focused changes to the existing UI, each independently shippable:

1. **RunSummary component** — the critical missing piece. Fetches `GET /api/units/:name/state` when a unit is selected. Renders status badge, error message, step progress, relative time, dispatch reasons. Handles 404 (never run) gracefully. Replaces the current two-column detail panel (WorkEditor | EventTail) with a three-section layout: RunSummary left, WorkEditor center, EventTail right.

2. **Historical event seeding** — On mount and when `selectedUnit` changes, fetch `GET /api/events?since=1h` (optionally filtered by unit). Prepend to the live SSE event array so the tail isn't empty on page load.

3. **ID truncation** — A `<ShortId>` utility component: renders first 7 chars in monospace, full value as `title` attribute (native browser tooltip on hover). Used in RunSummary for `runId`. Hashes (`workHash`, `policyHash`, `executorHash`) are not shown directly — RunSummary shows "work changed" / "policy changed" only when hashes differ from previous run (or omits hash display entirely for v1).

4. **Header labeling** — QuotaGauge: label changes from bare "week"/"session" to "week quota"/"session quota". ExternalDot: text changes from "no external sessions" to "external: idle" / "external: active (blocked)". DaemonControls tick input: add `aria-label` and visible "ms" suffix.

### Surface

- New file: `src/cli/ui-assets/src/components/RunSummary.tsx`
- New file: `src/cli/ui-assets/src/components/ShortId.tsx`
- Modified: `src/cli/ui-assets/src/App.tsx` (detail panel layout, event seeding)
- Modified: `src/cli/ui-assets/src/components/EventTail.tsx` (accept initial events prop)
- Modified: `src/cli/ui-assets/src/components/QuotaGauge.tsx` (label text)
- Modified: `src/cli/ui-assets/src/components/ExternalDot.tsx` (label text)
- Modified: `src/cli/ui-assets/src/components/DaemonControls.tsx` (input label)
- Modified: `tests/integration/cli/ui.test.ts` (test RunSummary fetch if needed)

### Validation

- `yarn typecheck` passes
- `yarn build:ui` produces dist
- `yarn test` passes (existing integration tests still green)
- Manual: open UI with a unit that has a failed latest run → error message, steps, and decision reasons visible without scrolling

### Backward compatibility

All changes are additive UI. No API changes. No new endpoints. No breaking changes to existing components' public props (EventTail gains an optional `initialEvents` prop).

### Lock-in

None. Pure React components consuming existing REST endpoints.

### Rollback

Revert the commits. No data migration, no server changes.

## Tasks

### Task 1: RunSummary component + ShortId utility
- **Files:**
  - New: `src/cli/ui-assets/src/components/RunSummary.tsx`
  - New: `src/cli/ui-assets/src/components/ShortId.tsx`
  - Modified: `src/cli/ui-assets/src/App.tsx` (add RunSummary to detail panel, fetch state on unit select)
- **Success:** Selecting a unit with a failed run shows: status badge, error message (full text), step-by-step progress (index + status + prompt excerpt), relative time ("2h ago"), dispatch reasons. RunId shown as 7-char truncation with full value on hover. 404 (no run) shows "never run". Three-section layout: RunSummary | WorkEditor | EventTail.
- **Validation:** `yarn typecheck && yarn build:ui && yarn test`
- **Budget:** medium

### Task 2: Historical event seeding
- **Files:**
  - Modified: `src/cli/ui-assets/src/App.tsx` (fetch `GET /api/events?since=1h` on mount, merge with SSE)
- **Success:** Opening the UI shows recent events immediately, not "no events". Selecting a unit filters to that unit's historical events. No duplicate events when SSE pushes an event already in the seed.
- **Validation:** `yarn typecheck && yarn build:ui && yarn test`
- **Budget:** short

### Task 3: Header labeling
- **Files:**
  - Modified: `src/cli/ui-assets/src/components/QuotaGauge.tsx`
  - Modified: `src/cli/ui-assets/src/components/ExternalDot.tsx`
  - Modified: `src/cli/ui-assets/src/components/DaemonControls.tsx`
- **Success:** QuotaGauge shows "week quota" / "session quota". ExternalDot shows "external: idle" / "external: active (blocked)". DaemonControls tick input has visible "ms" suffix label and `aria-label`.
- **Validation:** `yarn typecheck && yarn build:ui && yarn test`
- **Budget:** short

### Task 4: Integration test for state endpoint in UI
- **Files:**
  - Modified: `tests/integration/cli/ui.test.ts`
- **Success:** Test confirms `GET /api/units/:name/state` returns run record fields (status, runId, steps) for a unit that has been run, and 404 for a unit with no run.
- **Validation:** `yarn test`
- **Budget:** short

## Implement
- Task 1: `6d421df` — RunSummary + ShortId components
- Task 2: `e57fc78` — Historical event seeding
- Task 3: `54ea9a5` — Header labeling
- Task 4: `0fd42b7` — Integration test for state endpoint

## Notes / open questions
- The `GET /api/units/:name/state` endpoint returns 404 when no run record exists. RunSummary must handle that gracefully (show "never run" rather than an error).
- Consider whether dispatch decision reasons should be shown collapsed by default (they're verbose but important for debugging "why did it run at all?").
