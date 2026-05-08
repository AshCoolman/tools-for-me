# Spec: web-ui

## Status
- **Phase:** tasks
- **Owner:** Ash Coolman
- **Created:** 2026-05-08
- **Last advanced:** 2026-05-08 by `/mini-speckit-next` (plan → tasks)
- **Effort budget when ready to build:** medium

## Specify - WHAT and WHY

- **Problem:** Managing multiple in-flight `token-smoulder` units today means juggling terminal commands per unit (`run`, `state`, `events`, `unlock`, `clear-suppression`). There is no single screen showing what is dispatchable right now, what is blocked, or why. Separately, planning artifacts already exist elsewhere on the system — `~/ac/ideas/inbox.md` lines, `specs/**/plan.md`, Claude-Code planning-stage outputs, speckit specs — and turning each one into a smoulder unit requires hand-running `add` with a copy-pasted idea string.
- **Outcome:** `token-smoulder ui` opens a local web UI at `127.0.0.1:8788` that:
  1. shows every unit on a single board with live lint / check / run-state and per-row Run · Pause · Resume · Unlock controls,
  2. shows live quota gauges and an external-session indicator so blockers are obvious at a glance,
  3. accepts a dropped file or pasted text and routes it through the existing `add` pipeline, rendering the same verdict screen the CLI prints.
- **Non-goals:**
  - auth / multi-user / remote access (loopback only)
  - in-browser editor for `executor.ts` / `policy.ts` (those stay in `$EDITOR`)
  - metrics, charts, history dashboards
  - browser auto-open (print URL to stdout only; future `--open` flag is out of scope for v1)
  - replacing the CLI verbs (the UI is a control surface, not a parallel implementation)
- **Success criterion:**
  1. From any project containing `orchestration/`, running `token-smoulder ui` opens a board that lists every unit with current lint / `shouldRun` / run-state, reflects state changes within ~2s, and the per-row Run / Pause / Resume / Unlock buttons drive the corresponding CLI verbs end-to-end (verifiable by triggering each from the UI and observing matching state transitions in `.orchestration-state/` and `events.jsonl`).
  2. Dragging a file — e.g. one line from `~/ac/ideas/inbox.md` or a `specs/**/plan.md` — onto the page creates a new unit via the existing `add` code path and renders the same verdict screen `add` prints in the terminal (same `unit:`, `riskClass`, `policy`, `lint`, `check`, `next:` fields).
- **Threat-model link:** non-coverage / DX-only. Same trust boundary as the CLI itself: the server binds `127.0.0.1`, no auth, no CSRF tokens, no remote access. Anyone with shell access on this machine already has equivalent privileges via the CLI.
- **Constraints:**
  - **Single process, no DB.** State stays in `.orchestration-state/` (already canonical). UI is stateless.
  - **Thin shell over existing CLI verbs.** Server endpoints invoke `list`, `check`, `state`, `events`, `add`, `run`, `unlock`, `clear-suppression` (or their internal functions) — no duplicated business logic.
  - **React + Vite for the frontend.** UI source lives in `src/cli/ui-assets/`; `yarn build:ui` produces static HTML+JS that the Node server serves verbatim. Build artefacts ship in npm `files` so global installs work without a runtime build.
  - **Server transport: SSE for live updates** over plain HTTP (`text/event-stream`). No WebSocket dep, no polling overhead.
  - **Tier 1 ships independently.** Tier 2 (ingest) and Tier 3 (visibility) each have standalone value and must not block Tier 1, but all three are planned together in `## Plan` so shared infra (server shape, SSE channels, route layout) is coherent.
  - **Edit-in-browser limited to `work.md`.** Anything that touches code opens in `$EDITOR`.

## Plan - HOW

All three tiers are designed together so shared infra (server, SSE channel,
asset pipeline, prefs file) is coherent. Tier 1 ships first and is the
bar for "minimum useful"; Tiers 2 and 3 are independent follow-ups, each
shippable without the next. Decisions referenced as **A#** are the
"Aligned decisions" block in `## Notes`.

### Approach

- **Single command `token-smoulder ui`** (new) starts a long-lived
  loopback HTTP server on `127.0.0.1:8788`, prints the URL to stdout, and
  blocks until SIGINT. No browser auto-open (**A3**). `--port`,
  `--host` (rejected unless loopback) and `--no-banner` flags only;
  everything else is a UI control or a pref.
- **Thin server over existing CLI internals.** The HTTP layer never
  re-implements logic: each route imports the function the CLI command
  already calls (e.g. `runCommand`, `stateCommand`, `addCommand`,
  `unlockCommand`, `clearSuppressionCommand`, `daemonCommand`,
  `eventsCommand`, plus `findOrchestrationDir` /
  `findStateDir`). The server is the second consumer of the same
  internal API; CLI verbs stay the source of truth.
- **Live updates via SSE** (**A1**) on a single
  `GET /events` channel that fans out: `state`, `quota`, `external`,
  `events.jsonl tail`. Server polls the same sources `check` and
  `daemon` poll today (storage layer + `events.jsonl` tail + the quota
  adapter), and pushes diffs. No WebSocket dep, no client-side polling.
- **React + Vite app** (**A2**) at `src/cli/ui-assets/`. Build via
  `yarn build:ui` → `src/cli/ui-assets/dist/`. The Node server serves
  `dist/` as static files for `GET /` and `GET /assets/*`. Build output
  is committed to the npm `files` array so `npm install -g .` works
  without a runtime build.
- **Tier-aware feature flags inside the UI**, not separate apps. Tier 1
  is always on; Tier 2 (ingest) and Tier 3 (visibility) ride the same
  bundle and light up as their server routes land. This avoids two
  bundlers, two server shapes, two test surfaces.
- **No DB, no auth, no CSRF**. Same trust boundary as the CLI; loopback
  bind is the entire boundary. Documented in the threat-model link.

### Surface (HTTP)

Single namespace; SSE for push, JSON for one-shot reads/writes.

- `GET  /`                       — serves `index.html` from the bundle.
- `GET  /assets/*`               — serves built JS / CSS.
- `GET  /api/units`              — list every unit with current
  `riskClass`, lint summary, `shouldRun`, run-state, last event ts.
  Wraps `listCommand` + per-unit `checkCommand` + `stateCommand`.
- `GET  /api/units/:name/state`  — wraps `stateCommand`.
- `GET  /api/units/:name/work`   — returns raw `work.md` text. Tier 3.
- `PUT  /api/units/:name/work`   — debounced auto-save body
  (**A6**); validates name, writes via the same write helper the
  scaffold uses; emits a `work-saved` SSE event.
- `POST /api/units/:name/run`    — `runCommand(name, { once: true })`.
- `POST /api/units/:name/pause`  — TBD: implemented as suppression
  toggle (existing surface) until/unless a first-class pause lands.
- `POST /api/units/:name/resume` — clears the matching suppression.
- `POST /api/units/:name/unlock` — `unlockCommand(name)`.
- `POST /api/units/:name/clear-suppression` —
  `clearSuppressionCommand(key)`.
- `POST /api/add`                — multipart or JSON
  `{ idea?, fileText? }`. Wraps `addCommand`. Body pattern matches
  **A7** (file text copied into `# Context`). Returns the same verdict
  shape `add --json` returns.
- `GET  /api/sources`            — discovery shelf for Tier 2; returns
  candidates from the **A8** hard-coded list (`~/ac/ideas/inbox.md`
  line items + `./specs/**/*.md`).
- `GET  /api/quota`              — current week % + session %, from the
  same adapter `check` uses.
- `GET  /api/external`           — external-session indicator
  (`claude-token-usage-fragile` adapter).
- `GET  /api/suppressions`       — wraps `suppressionsCommand`.
- `GET  /api/prefs` / `PUT /api/prefs` — read/write
  `~/.config/token-smoulder/ui.json` (**A9**).
- `POST /api/daemon/start` / `/api/daemon/stop`                         —
  wraps `daemonCommand` with `tick` override (**A5**). Full log
  streaming is Tier 3 via the SSE event tail.
- `GET  /events` (SSE)           — push channel: `units` (full
  snapshot on connect, deltas after), `quota`, `external`, `event`
  (one frame per `events.jsonl` line, Tier 3 filter param).

### Files (new and modified)

New (server + asset pipeline):

- `src/cli/ui.ts`                  — `uiCommand`. Owns the
  `node:http` server, route table, and SSE fanout.
- `src/cli/ui-server/router.ts`    — route registration; thin
  dispatcher pairing `${method} ${path}` → handler.
- `src/cli/ui-server/sse.ts`       — SSE client registry, heartbeat
  (15s comments to keep proxies/tabs alive), shutdown drain.
- `src/cli/ui-server/handlers/*.ts` — one file per route family
  (`units.ts`, `add.ts`, `prefs.ts`, `daemon.ts`, `quota.ts`,
  `events.ts`). Each handler imports and calls the existing CLI
  function, never the storage layer directly.
- `src/cli/ui-server/prefs.ts`     — load/save XDG prefs
  (`${XDG_CONFIG_HOME:-~/.config}/token-smoulder/ui.json`); creates
  parent dirs on first write; tolerates missing/corrupt file
  (returns defaults + logs once).
- `src/cli/ui-server/sources.ts`   — Tier 2 discovery: hard-coded
  globs (**A8**), returns `{ path, title, snippet }`.
- `src/cli/ui-assets/` (Vite root) —
  `package.json` (own, `vite`, `react`, `react-dom`, `@vitejs/plugin-react`,
  `typescript`),
  `vite.config.ts` (build to `./dist/`, base `/`),
  `index.html`,
  `src/main.tsx`, `src/App.tsx`,
  `src/components/UnitBoard.tsx`, `src/components/QuotaGauge.tsx`,
  `src/components/ExternalDot.tsx`, `src/components/DaemonControls.tsx`,
  Tier 2: `src/components/SourceShelf.tsx`,
  `src/components/AddDropZone.tsx`, `src/components/Verdict.tsx`,
  Tier 3: `src/components/EventTail.tsx`,
  `src/components/WorkEditor.tsx`,
  `src/components/SuppressionsPanel.tsx`,
  `src/lib/sse.ts` (typed `EventSource` wrapper),
  `src/lib/api.ts` (typed `fetch` wrapper).
- `src/cli/ui-assets/dist/`        — build output. Committed
  (`.gitignore` carve-out so `npm pack` includes it).

Modified:

- `src/cli/index.ts`               — register `ui` command.
- `package.json`                   — add `yarn build:ui` script
  (`cd src/cli/ui-assets && yarn install --frozen-lockfile && yarn build`),
  add `src/cli/ui-assets/dist` to the `files` array, add `prepack`
  hook that runs `build:ui`. UI deps live in
  `src/cli/ui-assets/package.json`, **not** the root manifest, so
  `npm install -g @ashcoolman/token-smoulder` does not pull React
  into the global install.
- `bin/token-smoulder`             — no change. The new
  `ui` subcommand inherits env loading and tsx exec for free.
- `.gitignore`                     — keep `node_modules` ignored;
  carve out `!src/cli/ui-assets/dist/` so build output ships.
- `README.md`                      — one-paragraph "UI" section
  with the URL, the prefs path, and the disabled auto-open default.

Internal refactor (small, surgical):

- `src/cli/list.ts`, `src/cli/state.ts`, `src/cli/check.ts`,
  `src/cli/add.ts`, `src/cli/run.ts`, `src/cli/unlock.ts`,
  `src/cli/clear-suppression.ts`, `src/cli/daemon.ts`,
  `src/cli/events.ts`, `src/cli/suppressions.ts` — each currently
  writes to stdout/stderr inside the action. Where the function
  already returns structured data alongside printing, the UI server
  imports and reuses it. Where it doesn't, factor out a pure
  `*Inner` function (e.g. `listInner`, `stateInner`) that returns
  the data; the existing CLI wraps it with the print step.
  Surgical: no behavioural change to the CLI, no new tests required
  beyond the new `*Inner` smoke tests.

### Validation

Each tier has its own gate. All gates run before the next tier starts.

- **Tier 1 — control board:**
  - Unit/integration: a vitest suite under
    `tests/integration/cli/ui.test.ts` boots the server on an
    ephemeral port (`{ port: 0 }`), hits each route with `fetch`,
    and asserts the JSON shape matches the CLI verb's `--json`
    output for the same fixture.
  - SSE: a separate test opens an `EventSource` (or raw fetch
    stream), forces a state change via the storage layer, and
    asserts the next SSE frame carries the change within 2s.
  - Manual: `token-smoulder ui` from a project containing
    `orchestration/`, open the printed URL, run/pause/unlock a unit
    from the UI, see the change reflected within ~2s in
    `.orchestration-state/` and `events.jsonl`. (Mirrors the
    Specify success criterion #1.)
- **Tier 2 — ingest:**
  - Integration: `POST /api/add` with a fixture file body produces
    the same verdict JSON as `add --json` for the same input;
    `# Context` block in the new unit's `work.md` contains the
    full file text (**A7**).
  - Manual: drag a `~/ac/ideas/inbox.md` line and a
    `specs/**/plan.md` onto the page, see the verdict screen with
    one-click safe-fix buttons (**A10**) for safe fixes, plain text
    for unsafe.
- **Tier 3 — visibility:**
  - Integration: `PUT /api/units/:name/work` debounce-saves and
    triggers a `work-saved` SSE frame.
  - Manual: open the work editor, edit, watch ~1s of quiet, confirm
    the file changed on disk and the UI shows "saved".
- **Cross-tier:**
  - Type check: `yarn typecheck` (covers `src/cli/ui.ts` and the
    handler tree).
  - Lint: `yarn lint`.
  - Build: `yarn build:ui` produces `src/cli/ui-assets/dist/`.
  - Pack smoke: `npm pack --dry-run` lists
    `src/cli/ui-assets/dist/*` in the tarball contents.
  - Global install smoke: in a clean tmp dir, `npm install -g .`
    then `token-smoulder ui --port 0` boots and prints a URL.

### Backward-compat

- Pure additive. No existing CLI verb gains a flag, loses a flag, or
  changes its `--json` shape. The `*Inner` refactor preserves stdout
  byte-for-byte.
- No new env vars required to use existing CLI verbs. `XDG_CONFIG_HOME`
  is read for prefs (**A9**) but defaulted, matching
  `bin/token-smoulder`.
- Specs (`specs/main/contracts/*.ts`) are not in scope; this work is
  CLI surface, not contract surface. If a contract test starts
  mentioning the UI, that's a follow-up.

### Lock-in

- **SSE choice (A1)** locks us into a one-way push model. Acceptable
  because every Tier 1/2/3 update is server → browser; the few
  client → server actions are POSTs (run/pause/etc.). If a future
  feature needs duplex, add a WebSocket route alongside; SSE doesn't
  block that.
- **React + Vite (A2)** locks the UI source under
  `src/cli/ui-assets/` to a build step. Mitigated by committing
  `dist/` and gating `prepack`. If we ever rip React out, the swap
  is contained to `src/cli/ui-assets/`; the server route table is
  framework-agnostic.
- **Hard-coded discovery list (A8)** locks Tier 2's source-shelf to
  two paths. Mitigation pre-baked in **A8**: move to
  `~/.config/token-smoulder/sources.json` only when the hard-coded
  list is demonstrably insufficient.
- **Loopback bind** locks us out of remote use forever, by design.
  Anyone who wants remote can SSH-tunnel.

### Rollback

- Each tier is a discrete commit chain on its own branch
  (`feat/web-ui-tier1`, `…tier2`, `…tier3`). Reverting any tier is a
  `git revert <range>` and a `yarn build:ui`.
- Killing the feature wholesale: revert the `ui` command
  registration in `src/cli/index.ts`, drop the `prepack` hook, drop
  `src/cli/ui-assets/dist` from the `files` array. The
  `src/cli/ui-server/` and `src/cli/ui-assets/` trees can stay or
  be deleted; nothing else imports them.
- The `*Inner` refactor stays even on rollback — it's a pure
  reshape of existing code with no functional impact, and removing
  it would re-introduce the print-vs-data coupling the UI work
  exposed.

## Tasks

### Task 1 — Internal API refactor (`*Inner` functions)

**Files:** `src/cli/list.ts`, `src/cli/state.ts`, `src/cli/check.ts`, `src/cli/add.ts`, `src/cli/run.ts`, `src/cli/unlock.ts`, `src/cli/clear-suppression.ts`, `src/cli/daemon.ts`, `src/cli/events.ts`, `src/cli/suppressions.ts`

**What:** Each CLI command currently mixes data-gathering with stdout printing. Factor out a pure `*Inner` function (e.g. `listInner`, `stateInner`, `addInner`) that returns structured data. The existing command wraps it with the print step. No behavioral change to CLI output.

**Success:** Every CLI verb listed above has a named export `*Inner` that returns the same data the command prints, as a typed object. CLI verbs produce byte-identical stdout.

**Validation:** `yarn typecheck` passes. `yarn test` passes. Spot-check: `token-smoulder list --json` output unchanged.

**Budget:** medium

---

### Task 2 — Server skeleton + SSE + command registration

**Files (new):** `src/cli/ui.ts`, `src/cli/ui-server/router.ts`, `src/cli/ui-server/sse.ts`
**Files (modified):** `src/cli/index.ts`

**What:** Create the `uiCommand` that starts a `node:http` server on `127.0.0.1:8788`, prints the URL to stdout, blocks until SIGINT. Wire `--port`, `--host` (reject non-loopback), `--no-banner` flags. Implement the thin route dispatcher (`router.ts`). Implement SSE client registry with 15s heartbeat and shutdown drain (`sse.ts`). `GET /events` streams heartbeats. Register `ui` in `src/cli/index.ts`.

**Success:** `token-smoulder ui` boots, prints URL, `curl /events` receives SSE heartbeats, SIGINT shuts down cleanly. Non-loopback `--host` is rejected.

**Validation:** `yarn typecheck`. Manual: boot server, `curl -N http://127.0.0.1:8788/events` shows `:\n\n` heartbeats every 15s.

**Budget:** small

**Depends on:** —

---

### Task 3 — Vite scaffold + build pipeline + packaging

**Files (new):** `src/cli/ui-assets/package.json`, `src/cli/ui-assets/vite.config.ts`, `src/cli/ui-assets/tsconfig.json`, `src/cli/ui-assets/index.html`, `src/cli/ui-assets/src/main.tsx`, `src/cli/ui-assets/src/App.tsx`, `src/cli/ui-assets/src/lib/sse.ts`, `src/cli/ui-assets/src/lib/api.ts`
**Files (modified):** `package.json` (root), `.gitignore`

**What:** Set up the `src/cli/ui-assets/` Vite root with React 18, TypeScript, `@vitejs/plugin-react`. `vite.config.ts` builds to `./dist/`, base `/`, proxies `/api/*` and `/events` to `http://127.0.0.1:8788` in dev mode. Root `package.json` gets `build:ui` and `ui:dev` scripts. `.gitignore` carves out `!src/cli/ui-assets/dist/`. Root `package.json` `files` array includes `src/cli/ui-assets/dist`. `prepack` hook runs `build:ui`. Stub `App.tsx` renders a placeholder. Typed `sse.ts` wrapper (typed `EventSource` with reconnect). Typed `api.ts` fetch wrapper.

**Success:** `yarn build:ui` produces `src/cli/ui-assets/dist/index.html` + JS bundle. `yarn ui:dev` starts Vite dev server. `npm pack --dry-run` lists dist files. `token-smoulder ui` serves the built `index.html` at `/`.

**Validation:** `yarn typecheck`. `yarn build:ui`. `npm pack --dry-run | grep ui-assets/dist`. Manual: `token-smoulder ui` → open URL → see placeholder page.

**Budget:** medium

**Depends on:** Task 2

---

### Task 4 — Tier 1: Control board (API + UI)

**Files (new):** `src/cli/ui-server/handlers/units.ts`, `src/cli/ui-server/handlers/quota.ts`, `src/cli/ui-server/handlers/daemon.ts`, `src/cli/ui-server/prefs.ts`, `src/cli/ui-server/handlers/prefs.ts`, `src/cli/ui-assets/src/components/UnitBoard.tsx`, `src/cli/ui-assets/src/components/QuotaGauge.tsx`, `src/cli/ui-assets/src/components/ExternalDot.tsx`, `src/cli/ui-assets/src/components/DaemonControls.tsx`
**Files (modified):** `src/cli/ui.ts` (register routes), `src/cli/ui-server/sse.ts` (push unit/quota/external deltas)

**What:** Wire all Tier 1 API routes: `GET /api/units`, `GET /api/units/:name/state`, `POST /api/units/:name/run`, `POST /api/units/:name/pause`, `POST /api/units/:name/resume`, `POST /api/units/:name/unlock`, `POST /api/units/:name/clear-suppression`, `GET /api/quota`, `GET /api/external`, `GET /api/suppressions`, `GET|PUT /api/prefs`, `POST /api/daemon/start`, `POST /api/daemon/stop`. Each handler imports the `*Inner` function from Task 1. SSE pushes `units`, `quota`, `external` frames. XDG prefs at `~/.config/token-smoulder/ui.json`. Build the React board: `UnitBoard` (rows with state, lint, riskClass, actions), `QuotaGauge` (week + session %), `ExternalDot` (red/green), `DaemonControls` (start/stop + tick interval input). All components subscribe to SSE for live updates.

**Success:** Board shows all units with live state updates within ~2s. Per-row Run/Pause/Resume/Unlock buttons drive the matching CLI verb end-to-end. Quota gauge and external dot reflect live data. Daemon start/stop and tick override work. Prefs persist across restarts.

**Validation:** `yarn typecheck`. `yarn build:ui`. Integration test: boot server on ephemeral port, `fetch /api/units` returns JSON matching `list --json` shape. SSE test: force state change, assert next frame carries it within 2s. Manual: full Tier 1 success criterion from `## Specify`.

**Budget:** large

**Depends on:** Tasks 1, 2, 3

---

### Task 5 — Tier 2: Ingest (API + UI)

**Files (new):** `src/cli/ui-server/handlers/add.ts`, `src/cli/ui-server/sources.ts`, `src/cli/ui-assets/src/components/AddDropZone.tsx`, `src/cli/ui-assets/src/components/SourceShelf.tsx`, `src/cli/ui-assets/src/components/Verdict.tsx`

**What:** `POST /api/add` accepts JSON `{ idea?, fileText? }`, calls `addInner`, returns the verdict shape. File text is copied into `# Context` in the new unit's `work.md` (A7). `GET /api/sources` returns candidates from the hard-coded list: `~/ac/ideas/inbox.md` line items + `./specs/**/*.md` (A8). `AddDropZone`: drag-drop or paste-text, calls `/api/add`. `SourceShelf`: lists discovered sources as one-click import candidates with title preview. `Verdict`: renders the add verdict with one-click safe-fix buttons for safe mechanical fixes (A10); unsafe items render as plain text.

**Success:** Dragging a file onto the page creates a unit via `add`, verdict screen renders with safe-fix buttons. Source shelf lists candidates from hard-coded paths. `# Context` block in the new unit's `work.md` contains the full file text.

**Validation:** `yarn typecheck`. `yarn build:ui`. Integration test: `POST /api/add` with fixture body → verdict JSON matches `add --json`. Manual: drag `inbox.md` line onto page, see verdict, click a safe-fix, confirm unit created correctly.

**Budget:** medium

**Depends on:** Task 4

---

### Task 6 — Tier 3: Visibility (API + UI)

**Files (new):** `src/cli/ui-assets/src/components/EventTail.tsx`, `src/cli/ui-assets/src/components/WorkEditor.tsx`, `src/cli/ui-assets/src/components/SuppressionsPanel.tsx`
**Files (modified):** `src/cli/ui-server/handlers/units.ts` (add `GET /api/units/:name/work`, `PUT /api/units/:name/work`), `src/cli/ui-server/sse.ts` (add `event` frames from `events.jsonl` tail, `work-saved` frame)

**What:** `GET /api/units/:name/work` returns raw `work.md` text. `PUT /api/units/:name/work` debounce-saves body (A6), validates unit name, writes via scaffold write helper, emits `work-saved` SSE event. `EventTail`: live stream of `events.jsonl`, per-unit filter param via SSE `event` frames. `WorkEditor`: textarea with debounced auto-save (~1s after last keystroke), saved indicator. `SuppressionsPanel`: lists current suppressions with one-click clear.

**Success:** Event tail streams live events with per-unit filtering. Work editor saves ~1s after last keystroke, file changes on disk, UI shows "saved". Suppressions panel lists keys and clears them.

**Validation:** `yarn typecheck`. `yarn build:ui`. Integration test: `PUT /api/units/:name/work` triggers `work-saved` SSE frame. Manual: edit work.md in browser, wait 1s, confirm file changed on disk.

**Budget:** medium

**Depends on:** Task 4

---

### Task 7 — Integration tests + docs

**Files (new):** `tests/integration/cli/ui.test.ts`
**Files (modified):** `README.md`

**What:** Vitest integration suite that boots the server on an ephemeral port (`{ port: 0 }`), exercises each route family with `fetch`, asserts JSON shapes match CLI `--json` output. SSE test: open `EventSource`, force state change via storage layer, assert frame arrives within 2s. Pack smoke: `npm pack --dry-run` lists `src/cli/ui-assets/dist/*`. Global install smoke: `npm install -g .` then `token-smoulder ui --port 0` boots and prints URL. `README.md` gets a one-paragraph "UI" section: the URL, the prefs path, print-only (no auto-open).

**Success:** `yarn test` includes the UI integration suite and passes. `npm pack --dry-run` shows dist files. README documents the UI command.

**Validation:** `yarn test`. `npm pack --dry-run | grep ui-assets/dist`. Visual: README renders correctly.

**Budget:** medium

**Depends on:** Tasks 4, 5, 6

## Implement

- **Task 1:** _(pending commit)_

## Notes / open questions

### Solution sketch (captured for the plan phase)

Three tiers, ship in order. Each tier is independently useful.

**Tier 1 — multi-tasking control** (the primary motivation)
- Unit board: rows for every unit with `riskClass`, lint status, `shouldRun`, current state (idle / queued / running / paused / blocked), last event time. Color-coded.
- Per-row actions: Run-once · Pause · Resume · Unlock · View events. Each is a one-liner against the existing CLI verb.
- Quota gauge: live week + session % from the same adapter `check` uses. Doubles as a "what can dispatch right now" filter (hide rows blocked only by quota).
- External-session dot: red when `claude-token-usage-fragile` shows other sessions active. Single source of truth for "why is nothing dispatching".
- Daemon toggle + tick interval: start/stop the background dispatcher, change interval. Today this is per-shell; UI persists it.

**Tier 2 — schedule work from elsewhere** (the second motivation)
- File-drop / path-pick: drag a `.md` (spec, plan.md, an `inbox.md` line, a planning-stage Claude output) onto the page. Server runs `add` with the file's first line / heading as the idea, embeds the full text as `# Context` in `work.md`. Inverse: a paste-text box.
- Discovered-source shelf: scans known spots (`~/ac/ideas/inbox.md` line items, `specs/**/plan.md`, `specs/**/tasks.md`) and lists them as one-click import candidates with title preview. The "system does the discovery" promise from `add`, applied to ingest.
- Verdict screen: after import, render the same `add` verdict as HTML with one-click "fix the next thing" buttons for *safe mechanical* fixes only (widen allowlist to declared `riskClass`, regenerate empty Done When stub, drop a `prompt-flow` placeholder). Anything that touches code opens in `$EDITOR`.
- Schedule gates: per unit, pick "dispatch when week ≥ X%" or "after quiet window of N min". Daemon already evaluates these; UI exposes the knobs.

**Tier 3 — visibility**
- Live event tail (`events.jsonl`), per-unit filter.
- `work.md` viewer + edit-in-browser with save → file-watch reload. This is what makes "drop a file and iterate" actually pleasant.
- Suppressions panel: current keys, expiry, one-click clear.

### Aligned decisions (locked for plan phase)

Captured from the 10-question alignment pass on 2026-05-08:

1. **Live update transport:** Server-Sent Events (`text/event-stream`). One-way, no deps, plays well with the no-WebSocket constraint.
2. **UI framework:** React + Vite. Vite source under `src/cli/ui-assets/`; `yarn build:ui` produces static assets the Node server serves. Build output committed to npm `files` so global installs don't need a runtime build.
3. **Browser auto-open on `token-smoulder ui`:** off by default. Print the URL to stdout; user opens it themselves.
4. **Plan scope:** all three tiers planned in this single doc. Tier 1 still ships first.
5. **Daemon control from UI:** start/stop button + tick interval override. Full log streaming deferred to Tier 3.
6. **`work.md` edit-in-browser:** debounced auto-save (~1s after last keystroke). No explicit Save button.
7. **File-drop import:** copy file text into the new unit's `work.md` `# Context`. No path-reference indirection.
8. **Discovery sources for the source-shelf:** hard-coded v1 (`~/ac/ideas/inbox.md`, `./specs/**/*.md`). Move to `~/.config/token-smoulder/sources.json` only when the hard-coded list is demonstrably insufficient.
9. **UI prefs persistence:** `~/.config/token-smoulder/ui.json` (XDG). Matches the env-loading pattern in `bin/token-smoulder`.
10. **`add` verdict in UI:** rendered with one-click safe-fix buttons (Tier 2's "fix the next thing"). Plain-text fallback only if a fix isn't mechanically safe.

### Remaining open questions
- _(none — all alignment items resolved; deeper questions belong in `## Plan`.)_
