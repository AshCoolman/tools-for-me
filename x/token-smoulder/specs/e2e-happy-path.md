# Spec: e2e-happy-path

## Status
- **Phase:** done
- **Owner:** Ash
- **Created:** 2026-05-11
- **Last advanced:** 2026-05-11 by `/mini-speckit-next` (implement → done)
- **Pillar:** DX
- **Effort budget when ready to build:** medium

## Specify - WHAT and WHY
- **Problem:** The UI has no browser-level tests. Existing `tests/integration/cli/ui.test.ts` covers API endpoints only — no test verifies that the IDE layout renders correctly, that tabs open/close, that resize persists, that run output appears in the bottom panel, or that the add-work flow produces a new tab. UI regressions can only be caught manually.
- **Outcome:** An e2e test suite that exercises the happy path through the browser: load the app, verify sidebar items render, open a work item tab, see the 3-pane editor, run a unit and confirm output in the bottom panel, resize sidebar/panel and confirm localStorage persistence, open the add tab and submit a new work item. Tests run headless via `vitest` + Playwright (or equivalent) against a real UI server spawned per suite.
- **Non-goals:**
  - Visual regression / screenshot diffing.
  - Testing every error state or edge case — happy path only.
  - Mobile or responsive layout testing.
  - Testing the daemon start/stop flow (requires real Claude CLI).
- **Success criterion:**
  - `yarn test` (or a dedicated `yarn test:e2e` script) passes with all e2e tests green.
  - At least one test confirms: sidebar renders items -> click opens tab -> 3-pane editor visible -> Run button triggers POST -> bottom panel shows run result.
- **Threat-model link:** non-coverage / DX-only
- **Constraints:**
  - Must work headless in CI.
  - Reuse the existing `startServer` pattern from `ui.test.ts` (spawn `bin/token-smoulder ui --port 0`, parse URL from stdout).
  - Minimize new dependencies — prefer Playwright (`@playwright/test`) as single addition.
  - Tests must not depend on a real Claude API key or agent adapter — use the existing `fake-pass` quota source and fixture orchestrations.

## Plan - HOW

### Approach

Use Playwright's own test runner (`@playwright/test`) rather than vitest integration. Vitest has no stable browser-automation plugin, and Playwright's runner provides built-in parallel workers, auto-retries, trace collection, and `expect(locator)` assertions that vitest lacks. The e2e suite runs separately via `yarn test:e2e` so it doesn't slow down `yarn test`.

Each test file spawns a real UI server using the same `bin/token-smoulder ui --port 0` pattern from `ui.test.ts`, pointing at the `tests/fixtures/orchestration` directory with `TOKEN_SMOULDER_QUOTA_SOURCE=fake-pass`. A shared `startServer` helper in `tests/e2e/helpers.ts` handles spawn + URL extraction + teardown.

For tests that need run state (bottom panel content), a pre-written `latest.json` fixture is seeded into a temp state dir before the server starts — same technique as `ui.test.ts` line 72-97.

### Test scenarios (happy path)

1. **App loads** — sidebar shows fixture work items, titlebar says "token-smoulder", statusbar visible.
2. **Open tab via sidebar click** — click `valid-readonly` in sidebar → tab appears in tabbar → 3-pane editor renders with `work.md`, `policy.ts`, `executor.ts` headers.
3. **Tab close** — close button removes tab, active tab shifts.
4. **Bottom panel tabs** — RUN/EVENTS/GATES tabs switch content. With a seeded `latest.json`, RUN tab shows run status.
5. **Resize sidebar** — drag the sidebar resize handle → sidebar width changes → reload page → width persists from localStorage.
6. **Resize bottom panel** — drag the panel resize handle → panel height changes → reload page → height persists.
7. **Add new work tab** — click "+" or sidebar "Add new work" → add tab opens with input + drop zone. (Submit not tested — requires real filesystem scaffold beyond fixture dir.)

### Surface

- New: `tests/e2e/helpers.ts` — `startServer()` and `seedRunState()` helpers
- New: `tests/e2e/happy-path.spec.ts` — Playwright test file with the 7 scenarios
- New: `playwright.config.ts` — Playwright config (headless Chromium, baseURL from server, single worker)
- Modified: `package.json` — add `@playwright/test` to devDependencies, add `test:e2e` script

### Validation

- `npx playwright test` passes headless with all scenarios green.
- `yarn test` still passes (existing tests unaffected).
- `yarn typecheck` passes.

### Backward compatibility

No changes to existing tests or application code. The e2e suite is additive.

### Lock-in

Playwright. Widely adopted, Chromium ships bundled. Could switch to Puppeteer if needed but no reason to.

### Rollback

Delete `tests/e2e/`, `playwright.config.ts`, remove `@playwright/test` from devDependencies and `test:e2e` from scripts.

## Tasks

### Task 1: Playwright setup + server helper

Install `@playwright/test`, create `playwright.config.ts` (headless Chromium, single worker, 30s timeout), and write `tests/e2e/helpers.ts` with `startServer()` that spawns `bin/token-smoulder ui --port 0` with fixture env vars and returns `{ baseURL, cleanup }`. Add `test:e2e` script to `package.json`. Write a single smoke test that loads the page and asserts the titlebar text.

- **Files:** `playwright.config.ts`, `tests/e2e/helpers.ts`, `tests/e2e/smoke.spec.ts`, `package.json`
- **Success:** `npx playwright test` runs headless, the smoke test passes, `yarn test` still passes unchanged.
- **Validation:** `npx playwright test --reporter=list` shows 1 passed. `yarn test` passes.
- **Budget:** short

### Task 2: Sidebar + tab open/close tests

Test that the sidebar renders fixture work items (`valid-readonly`, etc.), clicking one opens a tab in the tabbar, the 3-pane editor renders with `work.md`, `policy.ts`, `executor.ts` pane headers, and the close button removes the tab.

- **Files:** `tests/e2e/happy-path.spec.ts`
- **Success:** Tests pass: sidebar items visible → click opens tab → pane headers present → close removes tab.
- **Validation:** `npx playwright test --reporter=list` shows all passed.
- **Budget:** short

### Task 3: Bottom panel + seeded run state tests

Add `seedRunState()` helper to write a `latest.json` into a temp state dir. Test that the RUN tab shows run status from the seeded record, EVENTS tab switches content, and GATES tab is selectable.

- **Files:** `tests/e2e/helpers.ts` (add `seedRunState`), `tests/e2e/happy-path.spec.ts`
- **Success:** Bottom panel tabs switch. RUN tab shows seeded run status. GATES tab renders.
- **Validation:** `npx playwright test --reporter=list` shows all passed.
- **Budget:** short

### Task 4: Resize persistence tests

Test sidebar drag-to-resize: move the resize handle, verify sidebar width changed, reload the page, verify the width persists from localStorage. Same for bottom panel height.

- **Files:** `tests/e2e/happy-path.spec.ts`
- **Success:** After drag + reload, sidebar width and panel height match the resized values.
- **Validation:** `npx playwright test --reporter=list` shows all passed.
- **Budget:** short

### Task 5: Add-work tab test

Test that clicking "+" in the tabbar (or "Add new work" in sidebar) opens the add tab with the input field and drop zone visible. Verify the tab label says "Add new work".

- **Files:** `tests/e2e/happy-path.spec.ts`
- **Success:** Add tab opens with input field, submit button, and drop zone rendered.
- **Validation:** `npx playwright test --reporter=list` shows all passed. `yarn typecheck` passes.
- **Budget:** short

## Implement
- Tasks 1-5: 43d73b6 (all tasks shipped in a single commit — small, cohesive suite)

## Notes / open questions
- The existing `ui.test.ts` helper `startServer()` can be extracted or duplicated for the e2e suite.
- Consider whether Playwright's built-in test runner or vitest + `@playwright/test` is cleaner — vitest integration avoids a second test runner config.
- The `tests/fixtures/orchestration` directory has `valid-readonly` and `unblock-short` which are sufficient for happy-path scenarios.
