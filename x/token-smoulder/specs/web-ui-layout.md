# Spec: web-ui-layout

## Status
- **Phase:** implement
- **Owner:** Ash
- **Created:** 2026-05-10
- **Last advanced:** 2026-05-10 by `/mini-speckit-next` (tasks → implement, Task 1)
- **Pillar:** DX
- **Effort budget when ready to build:** medium

## Specify - WHAT and WHY
- **Problem:** The web UI information hierarchy is wrong. Specific failures:
  1. Clicking "run" gives no inline feedback about failure — you have to discover the detail panel by clicking the unit name, which is not signposted.
  2. The detail panel is 3 equal columns (RunSummary | WorkEditor | EventTail) that overflow-ellipsis critical text. Error messages, step prompts, and event payloads are truncated.
  3. The ERROR box has no provenance — doesn't say which step failed, what process produced the error, or what the system was trying to do.
  4. "Dispatch reasons" is a flat list with no pass/fail distinction. Unclear whether it's showing rules that exist or rules that were evaluated and passed.
  5. WorkEditor is a tiny textarea for a full markdown document, with inner scroll competing against page scroll. No syntax highlighting.
  6. EventTail shows events every ~2s (SSE poll interval) with no grouping or context. Text overflow hides payload content.
  7. "add unit" section is full-width below everything, visually disconnected. "Discovered sources" (SourceShelf) is unexplained — no label, no context for what it does or where the sources come from.
  8. "unit" is internal terminology — the user doesn't think in "orchestration units."
- **Outcome:**
  - Each work item's three files (work.md, policy.ts, executor.ts) shown in equal vertical panes with independent scroll — no squeezed 3-column detail panel.
  - Run output, events, and gates move to a bottom panel with dedicated tabs — always visible, no hidden detail panel to discover.
  - Error display includes: which step failed (index + prompt excerpt), what command ran, and the full error text without truncation.
  - Dispatch reasons show pass (✓) vs fail (✗) per rule, grouped by gate.
  - File panes use monospace font, syntax coloring, and switch to textarea on edit.
  - Events wrap text, grouped by run with timestamp and name columns.
  - Adding work gets its own tab with input, drop zone, and source chips. Converts to the new work item's tab on success.
  - Terminology uses "work" instead of "unit" in user-facing labels.
- **Non-goals:**
  - Full markdown editor with live preview.
  - Drag-and-drop reordering of sections.
  - Mobile layout.
- **Success criterion:**
  - A user clicking "run" on a failing unit can read the full error message and identify which step failed without scrolling horizontally or hunting for a hidden panel.
  - No text-overflow ellipsis on error messages, step prompts, or event payloads.
- **Threat-model link:** non-coverage / DX-only
- **Constraints:**
  - No new npm dependencies.
  - Existing API endpoints unchanged. New read/write endpoints needed for policy.ts and executor.ts files.
  - Internal code can still use "unit" / "orchestration" — only user-facing labels change.

## Plan - HOW

### Information hierarchy — IDE layout

```
┌─────────────────────────────────────────────────────────────────┐
│ token-smoulder        external: idle  [Run] [Unlock]            │ titlebar
├──────────┬──────────────────────────────────────────────────────┤
│ WORK     │ [unblock-short ×] [valid-readonly ×] [+]             │ tabs
│ ● unblo… │──────────────────────────────────────────────────────│
│ ● valid… │ work.md [edit] │ policy.ts [edit] │ executor.ts [ed] │
│ ● inges… │────────────────│──────────────────│──────────────────│
│ ● rebui… │ # Objective    │ import { and }   │ export const     │
│          │ Generate the   │ from '../co…     │   executor =     │ 3 panes
│ [+ Add]  │ /unblock-short │                  │   executeAgent…  │
│          │ slash command  │ export const     │   ({ work }) =>  │
│          │ ...            │   policy = …     │   ({             │
│──────────│──────────────────────────────────────────────────────│
│ daemon   │ [RUN failed] [EVENTS] [GATES 4/4 ✓]                 │ panel tabs
│ [start]  │                                                      │
│ tick 30s │ run 01KR89Z · 10:42:33 · 3 steps                    │
│          │ step 1/3 ✗ FAILED                                    │ panel body
│ week  61%│   Claude Code process failed (exit 1)                │
│ sess  79%│   error: unknown option '--owner=scheduler'          │
└──────────┴──────────────────────────────────────────────────────┘
│ ● unblock-short  FAILED · 2h ago  step 1/3       week 61%      │ statusbar
└─────────────────────────────────────────────────────────────────┘
```

### Layout

**IDE shell.** Sidebar + tabbed main area + bottom panel. Replaces the table + detail-panel-below layout entirely.

**Sidebar** lists work items with status dot + name + risk chip (gray pill, 9px) + state label. Clicking opens/focuses a tab. Suppressed items show as "stopped" (--stopped color) with a secondary line below: "2x identical failure". Items that have never run show "—". Sidebar footer: daemon start/stop button + tick-interval input (ms), and quota gauge bars with color-coded fills (--warn above 60%, --ok below).

**Tabs** — multiple work items can be open simultaneously. Each tab shows a status dot and the work name. Closeable with ×. A "+" button opens the "Add new work" tab. When new work is successfully added, the add tab converts into that work item's tab.

**Main content** — three equal vertical panes (`grid-template-columns: 1fr 1fr 1fr`) showing the work item's triplet: `work.md` | `policy.ts` | `executor.ts`. Each pane has a sticky header (filename in mono/--chip color + edit button right-aligned) and an independently scrollable body. Monospace, syntax-colored (--hd for headings, --kw for keywords, --str for strings). Edit button switches to textarea mode per-pane.

**Bottom panel** — three tabs scoped to the active work item:
- **RUN**: Step-by-step execution output. Failed step shows prompt excerpt, then an error block with left-border + background tint, source label bold above ("Claude Code process failed (exit 1)"), full error text below. Subsequent steps show "skipped (prev failed)".
- **EVENTS**: Events grouped by run (header with runId + timestamp). Each event row: fixed-width timestamp column, fixed-width event name column, remainder for payload. Full text, word-wrap, no truncation.
- **GATES**: ✓/✗ per gate with gate name (min-width column) and reason text. Badge in tab label shows pass count ("4/4 ✓").

**Titlebar** — app name, external session status, Run and Unlock buttons (act on active tab's work item).

**Statusbar** — active work item's status dot, name, last run state, and quota summary.

### Terminology

- "unit" → "work" in all user-facing labels
- "suppressions" → "stopped" with reason "2x identical failure"
- "verdict" → inline result after adding work (no separate label needed)
- API paths and code identifiers unchanged

### Approach

**App.tsx rewrite**: Replace the current flat layout (header → table → 3-col detail → add section) with sidebar + tabs + content + panel. State model changes from `selectedUnit: string | null` to `openTabs: string[]` + `activeTab: string | null`. Add tab includes an `isAddTab` sentinel.

**Sidebar component** (new): Replaces UnitBoard's table rendering. Each item is a clickable row with dot + name + risk + state. Suppressed items get `--stopped` color and reason subtitle. Footer section with DaemonControls and QuotaGauge.

**RunPanel component** (replaces RunSummary): Bottom panel RUN tab. Fetches `/api/units/:name/state`. Renders step list with full prompts and error blocks with provenance labels.

**GatesPanel component** (new): Bottom panel GATES tab. Reads `decision.reasons` and `decision.failedReasons` from the run record. Maps gate function names to friendly labels.

**EventPanel component** (replaces EventTail): Bottom panel EVENTS tab. Groups events by `runId`. Full text, word-wrap.

**Pane editors**: Each of the three panes (work.md, policy.ts, executor.ts) switches between formatted `<pre>` view (default) and `<textarea>` (on edit click). work.md uses `GET/PUT /api/units/:name/work`. policy.ts and executor.ts need new read/write endpoints or file-read via a generic endpoint. Monospace, independently scrollable.

**AddTab component** (replaces AddDropZone + SourceShelf + Verdict): Full content-area tab with: text input (full-width, 13px), submit button (--blue-2), dashed drop zone for file drag/paste, and "import from" source chips (inline pill buttons). On successful add, calls back to convert tab to the new work item. Shows result inline (risk, validation status, policy check) with "allow this risk class" button if needed.

**SuppressionsPanel**: Removed as standalone. Suppression state rendered inline in sidebar items. "Clear" action becomes "unstop" — available via right-click or as a sidebar item action when selected.

### Surface

- Rewritten: `src/cli/ui-assets/src/App.tsx` (full layout rewrite)
- Rewritten: `src/cli/ui-assets/src/components/UnitBoard.tsx` → sidebar
- Rewritten: `src/cli/ui-assets/src/components/RunSummary.tsx` → RunPanel
- Rewritten: `src/cli/ui-assets/src/components/EventTail.tsx` → EventPanel
- Rewritten: `src/cli/ui-assets/src/components/WorkEditor.tsx` (pre/textarea toggle)
- Rewritten: `src/cli/ui-assets/src/components/AddDropZone.tsx` → AddTab (absorbs SourceShelf + Verdict)
- New: `src/cli/ui-assets/src/components/Sidebar.tsx`
- New: `src/cli/ui-assets/src/components/GatesPanel.tsx`
- Modified: `src/cli/ui-assets/src/components/QuotaGauge.tsx` (compact sidebar variant)
- Modified: `src/cli/ui-assets/src/components/DaemonControls.tsx` (compact sidebar variant)
- Modified: `src/cli/ui-assets/src/components/ExternalDot.tsx` (titlebar placement)
- Removed: `src/cli/ui-assets/src/components/SuppressionsPanel.tsx` (absorbed into sidebar)
- Removed: `src/cli/ui-assets/src/components/SourceShelf.tsx` (absorbed into AddTab)
- Removed: `src/cli/ui-assets/src/components/Verdict.tsx` (absorbed into AddTab)

### Validation

- `yarn typecheck` passes
- `yarn build:ui` produces dist
- `yarn test` passes
- Manual: open UI with a failed work item → full error visible without horizontal scroll, step identified, gates grouped

### Design system

CSS custom properties from w13 reference: `--bg` through `--bg-4` (surface hierarchy), `--fg`/`--fg-dim`/`--fg-mut`/`--fg-bright` (text), `--err`/`--ok`/`--warn`/`--stopped` (status), `--kw`/`--str`/`--hd`/`--chip` (syntax). `--mono` for code, `--sans` for chrome. Applied globally via `:root`.

### Backward compatibility

Layout rewrite. Existing API endpoints unchanged. New endpoints added for policy.ts and executor.ts read/write. SSE event names unchanged.

### Lock-in

None. CSS/JSX rendering changes + two new API endpoints.

### Rollback

Revert the commits.

## Tasks

### Task 1: Design system + App shell

Replace the flat layout in App.tsx with the IDE shell structure: frame → titlebar → body (sidebar slot + main slot). Add CSS custom properties from w13 (--bg through --bg-4, --fg variants, --err/--ok/--warn/--stopped, --kw/--str/--hd/--chip, --mono/--sans). Implement tab state model: `openTabs: string[]`, `activeTab: string | null`, `isAddTab` sentinel.

- **Files:** `src/cli/ui-assets/src/App.tsx`
- **Success:** App renders the IDE frame with titlebar (app name, external status, Run/Unlock), empty sidebar slot, empty content area, empty bottom panel, and statusbar. Tab state tracks open/close/switch. CSS variables applied globally.
- **Validation:** `yarn typecheck` passes. `yarn build:ui` produces dist. App loads in browser showing the shell structure.
- **Budget:** medium

### Task 2: Sidebar

New Sidebar.tsx replaces UnitBoard's table rendering. Work items as clickable rows: status dot + name + risk chip (gray pill) + state label. Suppressed items show --stopped color with "2x identical failure" subtitle. Never-run items show "—". "+ Add new work" button opens add tab. Footer section: daemon start/stop + tick input (ms), quota gauge bars with color-coded fills.

- **Files:** `src/cli/ui-assets/src/components/Sidebar.tsx` (new), `src/cli/ui-assets/src/components/QuotaGauge.tsx` (compact gauge-bar variant), `src/cli/ui-assets/src/components/DaemonControls.tsx` (compact sidebar variant), `src/cli/ui-assets/src/components/ExternalDot.tsx` (titlebar placement)
- **Success:** Sidebar renders all work items with correct status mapping. Clicking an item opens its tab. Daemon controls and quota gauges render in footer. ExternalDot renders in titlebar.
- **Validation:** `yarn typecheck` passes. Manual: sidebar items match `/api/units` data. Suppressed item shows "stopped" with reason.
- **Budget:** medium

### Task 3: Three-pane editor + file API

Each work tab shows three equal panes: work.md | policy.ts | executor.ts. Pane component with sticky header (filename + edit button) and independently scrollable body. Formatted `<pre>` view with syntax coloring (--hd/--kw/--str). Edit button switches to `<textarea>`. Add `GET/PUT /api/units/:name/policy` and `GET/PUT /api/units/:name/executor` endpoints (same pattern as existing work.md endpoints in ui.ts).

- **Files:** `src/cli/ui-assets/src/components/WorkEditor.tsx` (rewritten to pane mode), `src/cli/ui.ts` (new endpoints), `src/cli/ui-assets/src/App.tsx` (wire panes into tab content)
- **Success:** Active tab shows three panes with file content. Each pane scrolls independently. Edit button toggles textarea. Saves persist via PUT endpoints.
- **Validation:** `yarn typecheck` passes. `yarn test` passes. Manual: edit policy.ts in UI → file on disk changes. Reload → content persists.
- **Budget:** medium

### Task 4: Bottom panel — RunPanel + EventPanel + GatesPanel

Three-tab bottom panel scoped to active work item. RunPanel: step list with prompt excerpts, error blocks (left-border, background tint, bold source label). EventPanel: events grouped by run, columns for timestamp/name/payload, word-wrap. GatesPanel: ✓/✗ per gate with name column and reason text, badge in tab label.

- **Files:** `src/cli/ui-assets/src/components/RunSummary.tsx` → rewritten as RunPanel, `src/cli/ui-assets/src/components/EventTail.tsx` → rewritten as EventPanel, `src/cli/ui-assets/src/components/GatesPanel.tsx` (new), `src/cli/ui-assets/src/App.tsx` (wire panel tabs)
- **Success:** Bottom panel shows RUN/EVENTS/GATES tabs. Failed run shows step-by-step with error provenance. Events grouped by runId. Gates show ✓/✗ per gate with pass-count badge.
- **Validation:** `yarn typecheck` passes. Manual: open a failed work item → full error visible, step identified. Gates tab shows pass/fail per gate.
- **Budget:** medium

### Task 5: AddTab + component cleanup

AddTab replaces AddDropZone + SourceShelf + Verdict. Full content-area tab with text input, submit button, dashed drop zone, source chips. On success, tab converts to the new work item's tab. Remove absorbed components: SuppressionsPanel.tsx, SourceShelf.tsx, Verdict.tsx. Remove UnitBoard.tsx (replaced by Sidebar).

- **Files:** `src/cli/ui-assets/src/components/AddDropZone.tsx` → rewritten as AddTab, `src/cli/ui-assets/src/components/SuppressionsPanel.tsx` (removed), `src/cli/ui-assets/src/components/SourceShelf.tsx` (removed), `src/cli/ui-assets/src/components/Verdict.tsx` (removed), `src/cli/ui-assets/src/components/UnitBoard.tsx` (removed), `src/cli/ui-assets/src/App.tsx` (remove old imports)
- **Success:** "+ Add" opens add tab. Typing idea + submit creates work item and converts tab. Drop zone and source chips functional. No dead imports or unused components.
- **Validation:** `yarn typecheck` passes. `yarn build:ui` produces dist. `yarn test` passes. Manual: add a work item via UI → tab converts to the new item's 3-pane view.
- **Budget:** medium

## Implement
- Task 1: (pending commit)

## Notes / open questions
- The 3-column layout was introduced in `specs/web-ui-clarity.md` Task 1. This spec supersedes that layout decision.
- "unit" appears in API paths (`/api/units`), component names (`UnitBoard`), and user-facing labels. Only labels change here; API paths and code identifiers stay as-is.
- Consider whether the detail panel should auto-open when a run completes/fails, rather than requiring a click on the unit name.
