# Spec: runs-panel

## Status
- **Phase:** done
- **Owner:** Ash
- **Created:** 2026-05-11
- **Last advanced:** 2026-05-11 by `/mini-speckit-next` (tasks → done)
- **Pillar:** DX
- **Effort budget when ready to build:** long

## Specify - WHAT and WHY
- **Problem:** The bottom panel treats runs as a secondary diagnostic detail — one of three tabs (RUN/EVENTS/GATES) scoped to the currently selected unit. There is no browsable history, no cross-unit view, no temporal progression. The user clicks Run and jumps from "never run" to "completed" with no visible transition. Runs are the primary output of a work orchestrator but the UI hides them.
- **Outcome:** The bottom panel becomes a RUNS panel — a global, chronological, vertical list of all runs across all units. Single-line rows show status, unit name, gate bollard pipeline, segmented step bar, risk class, error text, timestamp, duration, and pin icon. Two filter modes (all / focused on selected tab's unit). Pinnable rows persist across filter changes. Click-to-expand shows full step detail, gate detail, and error blocks. Gate bollards use retractable-bollard visual metaphor with thread line connecting gates to steps. Live SSE updates drive the list without polling.
- **Non-goals:**
  - Search/text filtering controls (deferred)
  - Gate bollard continuous/partial values in this pass (deferred — mockup exists at `mockups/runs-panel-gates.html` for reference)
  - Replacing the editor panes or sidebar
  - Multi-user or auth
- **Success criterion:**
  - Opening UI shows all historical runs across all units in the bottom panel without selecting a unit first
  - A running job shows live step progression (pulsing active step) in the panel row
  - Full error strings visible in compact rows (not truncated to unreadable fragments)
  - Pin a row, switch filter → row stays visible
- **Threat-model link:** non-coverage / DX-only
- **Constraints:**
  - Must add `listRuns(orchestrationName)` to Storage interface + FsStorage (reads all `{runId}.json` from `runs/{name}/` directory, excludes `latest.json`)
  - Must add `GET /api/units/:name/runs` endpoint returning `RunRecord[]`
  - Must reuse existing SSE event types (`run_started`, `prompt_started`, `prompt_completed`, `run_completed`, `run_failed`) for live updates — no new event types
  - No new npm dependencies
  - Panel height stays resizable via existing drag handle
  - Reference mockups: `mockups/runs-panel.html` (compact + expanded), `mockups/runs-panel-gates.html` (gate bollard motif)

## Plan - HOW

### Approach

Replace the bottom panel's three-tab layout (RUN / EVENTS / GATES) with a single RUNS panel that is a global vertical list of all runs. The panel has a header with filter toggles (all / focused unit name) and a scrollable run list. Each run is a single-line row. Clicking a row expands an inline detail view (steps, gates, errors). Rows can be pinned client-side.

Five layers of work, each independently testable:

1. **Storage: `listRuns` method** — Add to `Storage` interface and `FsStorage`. Reads all `*.json` files from `runs/{name}/`, excludes `latest.json`, parses and returns `RunRecord[]` sorted newest-first. Needed before the API endpoint can return history.

2. **API: `GET /api/units/:name/runs` endpoint** — New handler in `handlers/units.ts`, new route in `ui.ts`. Returns `RunRecord[]` from `storage.listRuns(name)`. The frontend fetches all units' runs on mount and merges them into one sorted list.

3. **CSS: panel styles** — New CSS rules in `app.css` for `.runs-panel`, `.run-row`, `.pipeline`, `.gate`, `.thread`, `.step-seg`, `.run-detail`, etc. Taken directly from the mockup HTML. Replaces the old `.panel-tabs` / `.panel-tab` styling (those elements are removed).

4. **React: `RunsPanel` component** — New component replacing the old RunSummary/EventTail/GatesPanel panel tabs. Contains:
   - State: `runs: RunRecord[]`, `pinnedIds: Set<string>`, `expandedId: string | null`, `filter: 'all' | string`
   - On mount: fetch `GET /api/units/:name/runs` for every unit, merge, sort by `startedAt` desc
   - SSE: subscribe to `event` channel, update run records in-place when `run_started`, `prompt_started`, `prompt_completed`, `run_completed`, `run_failed` arrive
   - Filter: `all` shows everything; clicking a unit name button shows only that unit's runs + pinned
   - Pin: toggled per row, stored in state (localStorage persistence optional later)
   - Expand: clicking a row sets `expandedId`, renders detail view below the row

5. **App.tsx wiring** — Remove the `panelTab` state and three-tab panel structure. Replace with `<RunsPanel>` that receives `units`, `activeTab`, and `events`. The `filter` toggle auto-switches to focused mode when a tab is selected.

### Surface

- Modified: `src/adapters/storage/interface.ts` (add `listRuns` to `Storage` type)
- Modified: `src/adapters/storage/fs.ts` (implement `listRuns` in `FsStorage`)
- Modified: `src/cli/ui-server/handlers/units.ts` (add `getUnitRuns` handler)
- Modified: `src/cli/ui.ts` (add `GET /api/units/:name/runs` route)
- New: `src/cli/ui-assets/src/components/RunsPanel.tsx`
- Modified: `src/cli/ui-assets/src/app.css` (add panel row/pipeline/detail styles, remove old panel-tab styles only if no longer referenced)
- Modified: `src/cli/ui-assets/src/App.tsx` (remove panelTab state, replace panel body with RunsPanel)

### Validation

- `yarn typecheck` passes
- `yarn build:ui` produces dist
- `yarn test` passes
- Manual: start UI server, trigger runs on multiple units, verify runs appear live, expand detail, pin a row, switch filters

### Backward compatibility

No API contracts broken. `GET /api/units/:name/state` remains. The new `/runs` endpoint is additive. The RunSummary, GatesPanel, EventTail components stay in the codebase (EventTail is still used for the event SSE stream in App.tsx; RunsPanel replaces RunSummary and GatesPanel in the panel).

### Lock-in

None. Pure React + CSS consuming REST endpoints.

### Rollback

Revert commits. No data migration, no schema changes.

## Tasks

### Task 1: Storage — `listRuns` method
- **Files:**
  - Modified: `src/adapters/storage/interface.ts`
  - Modified: `src/adapters/storage/fs.ts`
- **Success:** `listRuns(orchestrationName)` returns all `RunRecord[]` from `runs/{name}/` directory, excluding `latest.json`, sorted newest-first by `startedAt`. Returns empty array when no runs exist.
- **Validation:** `yarn typecheck && yarn test`
- **Budget:** short

### Task 2: API — `GET /api/units/:name/runs` endpoint
- **Files:**
  - Modified: `src/cli/ui-server/handlers/units.ts` (add `getUnitRuns` handler)
  - Modified: `src/cli/ui.ts` (register route)
- **Success:** `GET /api/units/e2e-runnable/runs` returns `RunRecord[]`. Returns `[]` for units with no runs.
- **Validation:** `yarn typecheck && yarn test`
- **Budget:** short

### Task 3: CSS — panel row, pipeline, and detail styles
- **Files:**
  - Modified: `src/cli/ui-assets/src/app.css`
- **Success:** All CSS classes from the mockups are present: `.runs-panel-header`, `.runs-list`, `.run-row`, `.pipeline`, `.gate`, `.gate.open`, `.gate.closed`, `.thread`, `.thread.live`, `.thread.blocked`, `.step-seg` (done/active/fail/pending/blocked), `.pipe-gap`, `.run-unit`, `.run-status`, `.run-risk`, `.run-error`, `.run-time`, `.run-duration`, `.run-pin`, `.pin-divider`, `.run-detail`, `.detail-meta`, `.step-row`, `.step-error`, `.detail-section-label`. Existing `.panel`, `.panel-body` structure preserved for the container.
- **Validation:** `yarn build:ui`
- **Budget:** short

### Task 4: React — `RunsPanel` component
- **Files:**
  - New: `src/cli/ui-assets/src/components/RunsPanel.tsx`
- **Success:** Component renders a vertical list of runs. Each row is a single line: status icon → unit name → gate bollards with thread → step segments → risk chip → error text → spacer → time → duration → pin icon. Supports: filter (`all` / focused unit name), pin toggle, click-to-expand detail view with steps + gates + error blocks. Accepts `units: {name}[]`, `events: EventEntry[]`, `focusedUnit: string | null` as props. Fetches runs from `GET /api/units/:name/runs` on mount. Updates run state from SSE events in the `events` prop.
- **Validation:** `yarn typecheck && yarn build:ui`
- **Budget:** medium

### Task 5: App.tsx — wire RunsPanel, remove old panel tabs
- **Files:**
  - Modified: `src/cli/ui-assets/src/App.tsx`
- **Success:** Bottom panel shows `<RunsPanel>` instead of the old RUN/EVENTS/GATES tab structure. `panelTab` state removed. `GatesPanel` import removed (no longer used in panel). `RunSummary` import removed (replaced by RunsPanel). `useGatesBadge` call removed. Filter auto-sets to focused unit when a tab is selected. Panel height still resizable.
- **Validation:** `yarn typecheck && yarn build:ui && yarn test`
- **Budget:** short

## Implement
All 5 tasks shipped in `79598e6`.

## Notes / open questions
- The gate bollard mockup shows partial/continuous gate values (e.g. time-based gates approaching open). This is deferred from first pass but the CSS/component structure should accommodate it without refactoring.
- Gate thread width = N gates × 7px + 8px gap when all open. Thread stops at first blocking gate's position: gate N blocks → width = (N-1) × 7px.
- The existing RunSummary component fetches only on mount — never re-fetches after a run completes. The new SSE-driven RunsPanel solves this by construction.
