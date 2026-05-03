---
description: "Task list for Claude Usage Scraper (OAuth direct)"
---

# Tasks: Claude Usage Scraper (OAuth direct)

**Input**: Design documents at `specs/001-claude-usage-scraper/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included by design — `bats-core` is selected in research.md §R6 and is the constitutional smoke-test mechanism. Test tasks here are not optional.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md). Phases 1–2 (Setup + Foundational) must complete before any story phase; story phases proceed in priority order.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Different file, no in-flight dependency on an earlier task — safe to run in parallel.
- **[Story]**: Maps the task to a user story (US1–US4); omitted on Setup, Foundational, and Polish tasks.
- File paths below are repo-relative from the package root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the directory layout and verify host dependencies. No implementation yet.

- [X] T001 Create the source-tree directories at the repo root: `scripts/`, `launchd/`, `tests/fixtures/`, `tests/unit/`, `tests/integration/`. (No files yet — Foundational and story phases place files into them.)
- [X] T002 [P] Verify host dependencies (`/bin/bash --version` → 3.2.x, `command -v jq`, `command -v bats`, `command -v curl`, `command -v python3`); document the exact versions seen in `tests/HOST.md` for the operator.
- [X] T003 [P] Add `.gitignore` entries: `tests/.tmp/`, `*.log`, `tests/fixtures/credentials.real.json` (in case the operator drops a real cred file there during discovery).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the skeleton script, log helpers, fixtures, plist, and test harness — everything every user story needs.

**⚠️ CRITICAL**: No user-story phase may begin until Phase 2 completes.

- [X] T004 Create `scripts/scrape-usage` skeleton: shebang `#!/bin/bash`, `set -euo pipefail`, constants block at top with placeholder values per `data-model.md` §EndpointConfig (`USAGE_URL`, `ANTHROPIC_VERSION`, `ANTHROPIC_BETA`, `SESSION_PERCENT_PATH`, `SESSION_RESETS_PATH`, `WEEK_PERCENT_PATH`, `WEEK_RESETS_PATH`), plus `DASHBOARD_URL="http://127.0.0.1:8787/api/usage"` and an env-overridable `DASHBOARD_URL_OVERRIDE` per research §R7. Make file executable (`chmod +x`).
- [X] T005 [P] Add structured logging helpers `log_ok <step> <msg>` and `log_fail <step> <msg>` to `scripts/scrape-usage` emitting one line per call to stderr in the exact format from `contracts/log-format.md` (`<ISO8601-utc> [<level>] <step>: <message>`, UTC, `Z` suffix, no fractional seconds). The fail helper MUST also `exit <code>` with the code mapped per `contracts/exit-codes.md`.
- [X] T006 [P] Add a secret-redaction helper `redact_token <token>` to `scripts/scrape-usage` that returns only the integer length (e.g. `len=156`) so log messages can mention token presence without leaking the value (FR-010, log-format §Secret-redaction rules).
- [X] T007 [P] Create `tests/fixtures/credentials.valid.json` matching `contracts/credential.schema.json` with non-empty `access_token`, `refresh_token`, and an `expires_at` set to a Unix-epoch-ms value 1 hour in the future relative to the test run (use `$(($(date +%s) * 1000 + 3600000))` at fixture-load time, or hardcode a far-future date and rely on test setup to refresh it).
- [X] T008 [P] Create `tests/fixtures/credentials.expired.json` matching `contracts/credential.schema.json` with `expires_at` set to a past Unix-epoch-ms value (e.g. `1700000000000`), all other fields valid.
- [X] T009 [P] Create `tests/fixtures/upstream-usage.json` as a PLACEHOLDER body whose shape satisfies the four jq paths from T004's constants block (e.g. `{"session":{"utilizationPercent":42,"resetsAt":"2026-04-30T15:00:00Z"},"week":{"utilizationPercent":18,"resetsAt":"2026-05-05T00:00:00Z"}}`). T029 (US3) replaces this with the real captured fixture once discovery completes.
- [X] T010 Create `launchd/com.user.claude-usage-scraper.plist` per `data-model.md` §SchedulerAgent: `Label`, `ProgramArguments` containing the literal token `__REPO_PATH__/scripts/scrape-usage` (substituted at install time by `install.sh`), `StartInterval=300`, `RunAtLoad=true`, `StandardErrorPath=/Users/__USER__/Library/Logs/claude-usage-scraper.log`, `EnvironmentVariables.PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"`. No `StandardOutPath`.
- [X] T011 Create `tests/test_helper.bash` with bats common setup: a `setup_dashboard_stub` function that launches a 5-line Python `http.server` subclass on a random `127.0.0.1` port and exports `DASHBOARD_URL_OVERRIDE` accordingly (per research §R7); a `teardown_dashboard_stub` that kills the listener; a `with_temp_credentials <fixture>` helper that copies a fixture into a per-test `HOME` so `~/.claude/.credentials.json` resolves to the temp file.

**Checkpoint**: Foundation ready — story phases may now start.

---

## Phase 3: User Story 1 — Live usage on the local dashboard (Priority: P1) 🎯 MVP

**Goal**: Operator installs once; within 5 minutes the dashboard's Usage card shows live session/week percentages with `resetsAt` timestamps, and stays current.

**Independent Test**: Load the launchd agent with valid (non-expired) credentials, wait one cycle, observe the dashboard's Usage card transitions from stale-hint to live percentages matching `/usage` in a concurrent `claude` REPL within ±1pp.

### Tests for User Story 1 (write FIRST, ensure they FAIL before implementation)

- [X] T012 [P] [US1] Write `tests/unit/transform.bats`: feed `tests/fixtures/upstream-usage.json` through the `transform` function and assert the produced snapshot matches `contracts/snapshot.schema.json` (use `jq -e` against the four required paths and types; assert `scrapedAt` ends in `Z`; assert `raw` is the verbatim input).
- [X] T013 [P] [US1] Write `tests/integration/happy-path.bats`: stub upstream via a second `setup_dashboard_stub`-style listener returning `tests/fixtures/upstream-usage.json` on the configured `USAGE_URL` (override via env in the test); use `tests/fixtures/credentials.valid.json`; run `scripts/scrape-usage`; assert exit `0`, exactly one `[ok] run: scraped` log line, and that the dashboard stub received one `POST /api/usage` whose body validates against `contracts/snapshot.schema.json`.

### Implementation for User Story 1

- [X] T014 [US1] Implement `load_credentials` in `scripts/scrape-usage`: read `~/.claude/.credentials.json`, parse with `jq -e`, validate `access_token` and `refresh_token` are non-empty strings and `expires_at` is a number; on any failure call `log_fail load <reason>` and exit `10` per `contracts/exit-codes.md`.
- [X] T015 [US1] Implement `fetch_upstream` in `scripts/scrape-usage`: `curl --fail --silent --show-error -H "authorization: Bearer $access_token" -H "anthropic-version: $ANTHROPIC_VERSION"` (and `-H "anthropic-beta: $ANTHROPIC_BETA"` only if non-empty) against `$USAGE_URL`; capture body to a variable; on non-2xx, network error, or non-JSON body call `log_fail fetch <reason>` and exit `30`.
- [X] T016 [US1] Implement `transform` in `scripts/scrape-usage`: a single `jq` invocation that consumes the upstream body and emits `{session:{percent: <SESSION_PERCENT_PATH>, resetsAt: <SESSION_RESETS_PATH>}, week:{percent: <WEEK_PERCENT_PATH>, resetsAt: <WEEK_RESETS_PATH>}, scrapedAt: <utc-iso>, raw: .}`; if any of the four paths returns null or wrong type, call `log_fail transform <which-path>` and exit `40`.
- [X] T017 [US1] Implement `post_snapshot` in `scripts/scrape-usage`: `curl --fail --silent --show-error -X POST -H 'content-type: application/json' --data-binary @- "${DASHBOARD_URL_OVERRIDE:-$DASHBOARD_URL}"` reading the snapshot from stdin; on non-2xx or connection refused call `log_fail post <reason>` and exit `50`.
- [X] T018 [US1] Implement `main` in `scripts/scrape-usage`: orchestrate `load_credentials` → (refresh hook reserved for US2 — leave a no-op call site `maybe_refresh`) → `fetch_upstream` → `transform` → `post_snapshot`; on success emit one `log_ok run scraped` line and exit `0`. Verify the script's total LoC ≤ 150 (Constitution V).
- [X] T019 [US1] Run `bats tests/unit/transform.bats` and `bats tests/integration/happy-path.bats`; both must pass before checkpointing.

**Checkpoint**: US1 complete — script can load creds, hit a stubbed upstream, transform, and POST to a stubbed dashboard. End-to-end pipeline works against fixtures.

---

## Phase 4: User Story 2 — Silent token refresh (Priority: P1)

**Goal**: When `expires_at <= now()`, the scraper exchanges the refresh token, atomically rewrites `~/.claude/.credentials.json`, and continues scraping. Operator notices nothing.

**Independent Test**: Replace credentials with `tests/fixtures/credentials.expired.json`, stub the OAuth refresh endpoint to return a fresh token, run the scraper. Assert the credentials file is rewritten with a new `access_token` and a future `expires_at`, and the scrape POST succeeds.

### Tests for User Story 2 (write FIRST, ensure they FAIL before implementation)

- [X] T020 [P] [US2] Write `tests/unit/refresh.bats`: unit-test the `is_expired` check with a fixture in the past, present, and future; assert correct boolean. Unit-test the atomic-write behavior by calling the write helper with a mocked new credential and asserting (a) the destination file is replaced, (b) at no point during the write does a partial file appear (use `inotifywait`-equivalent or simply verify final mode `0600` and content equality).
- [X] T021 [P] [US2] Write `tests/integration/refresh-end-to-end.bats`: use `credentials.expired.json`; stub the OAuth refresh URL (extend `test_helper.bash` with `setup_oauth_stub`) to return `{"access_token":"NEW","refresh_token":"NEWREFRESH","expires_at":<future-ms>}`; stub upstream; run scraper; assert exit `0`, the credentials file now contains `access_token=NEW`, and the dashboard stub received the POST.

### Implementation for User Story 2

- [X] T022 [US2] Implement `is_expired` in `scripts/scrape-usage`: compare `expires_at` (Unix epoch ms) against `$(date +%s)000` (Bash 3.2-compatible: shell out to `date +%s` and append `000`). No skew margin per research §R3.
- [X] T023 [US2] Add OAuth refresh constants to the constants block at the top of `scripts/scrape-usage`: `OAUTH_REFRESH_URL` (Anthropic OAuth token endpoint — operator fills during discovery, placeholder for now), `OAUTH_CLIENT_ID` (placeholder).
- [X] T024 [US2] Implement `refresh_token_exchange` in `scripts/scrape-usage`: `curl --fail --silent --show-error -X POST -H 'content-type: application/json' --data "$(jq -n --arg rt "$refresh_token" --arg cid "$OAUTH_CLIENT_ID" '{grant_type:"refresh_token", refresh_token:$rt, client_id:$cid}')" "$OAUTH_REFRESH_URL"`; parse the response; on non-2xx or missing fields call `log_fail refresh <reason>` and exit `20`.
- [X] T025 [US2] Implement `write_credentials_atomic <new-creds-json>` in `scripts/scrape-usage`: write to `~/.claude/.credentials.json.tmp.$$` with `umask 077`, `chmod 600`, then `mv -f` over `~/.claude/.credentials.json`. On any write failure call `log_fail refresh "atomic write failed: <reason>"` and exit `20` (per data-model §Credential and research §R2).
- [X] T026 [US2] Replace the `maybe_refresh` no-op call site (T018) with the real implementation: after `load_credentials`, if `is_expired`, call `refresh_token_exchange` followed by `write_credentials_atomic`, then re-load credentials in-memory before `fetch_upstream`.
- [X] T027 [US2] Run `bats tests/unit/refresh.bats` and `bats tests/integration/refresh-end-to-end.bats`; both must pass. Re-run T019's tests to confirm no regression.

**Checkpoint**: US2 complete — refresh path works end-to-end against stubs; credential writes are atomic.

---

## Phase 5: User Story 3 — Endpoint discovery before install (Priority: P2)

**Goal**: Operator captures the live shape of the Anthropic usage endpoint via mitmproxy and bakes URL/headers/jq-paths into the constants block. This is the deferred R5 step; tasks here are mostly operator actions plus the artifact updates that follow.

**Independent Test**: Per quickstart §Gate 1 — the captured request reproduces from `curl` and `bats tests/unit/transform.bats` passes against the new `tests/fixtures/upstream-usage.json`.

> No test tasks for US3 — it produces the fixture and constants that US1's tests rely on. Validation is "US1's tests still pass after this phase's outputs replace placeholders."

### Implementation for User Story 3

- [ ] T028 [US3] Operator action: run mitmproxy capture per `quickstart.md` §Gate 1 steps 1–5. Record the request URL, method, all relevant headers (including `anthropic-version` and any `anthropic-beta`), and the response body. Store the raw flow at `tests/fixtures/upstream.flow` (gitignored — contains tokens) and a scrubbed copy at `tests/fixtures/upstream-usage.captured.json`.
- [ ] T029 [US3] Replace `tests/fixtures/upstream-usage.json` (the placeholder from T009) with the contents of `tests/fixtures/upstream-usage.captured.json` after manual review confirms zero token leakage.
- [ ] T030 [US3] Edit the constants block in `scripts/scrape-usage`: replace placeholder `USAGE_URL`, `ANTHROPIC_VERSION`, `ANTHROPIC_BETA`, `SESSION_PERCENT_PATH`, `SESSION_RESETS_PATH`, `WEEK_PERCENT_PATH`, `WEEK_RESETS_PATH` with values derived from the captured flow. No changes outside the constants block.
- [ ] T031 [US3] Update `specs/001-claude-usage-scraper/contracts/upstream-usage.schema.json` to replace the PLACEHOLDER schema with a concrete JSON Schema describing the captured response shape (required fields, types, formats).
- [ ] T032 [US3] Re-run `bats tests/unit/transform.bats` against the real fixture and concrete constants; all assertions in T012 must still hold against the new shape (update assertion paths if the upstream uses different field names than the placeholders chose).
- [ ] T033 [US3] Capture the OAuth refresh endpoint URL and required `client_id` during the same mitmproxy run (or a separate one if `claude` only refreshes on demand); update the `OAUTH_REFRESH_URL` and `OAUTH_CLIENT_ID` constants in `scripts/scrape-usage` (placeholders set in T023).

**Checkpoint**: US3 complete — script's constants block reflects live Anthropic shape; placeholder fixtures replaced; transform/refresh tests pass against real shape.

---

## Phase 6: User Story 4 — Loud failure, graceful degradation (Priority: P2)

**Goal**: Every failure path exits non-zero with the correct exit code, emits exactly one `[fail] <step>: <reason>` log line, and never POSTs. Verified by injecting failures at every step.

**Independent Test**: For each of `load`, `refresh`, `fetch`, `transform`, `post`: inject the corresponding failure, run the scraper, assert exit code per `contracts/exit-codes.md`, log line conforms to `contracts/log-format.md`, and the dashboard stub receives zero POSTs in that run.

### Tests for User Story 4 (write FIRST, ensure they FAIL before implementation)

> Implementation for US4 is mostly already in place from US1+US2. These tests prove the contract; any failure here is a US1/US2 bug to fix.

- [X] T034 [P] [US4] Write `tests/integration/failure-load.bats`: missing credentials file → exit `10`, log line `[fail] load: ...`, no POST.
- [X] T035 [P] [US4] Write `tests/integration/failure-load-malformed.bats`: malformed JSON in credentials → exit `10`, log line `[fail] load: ...`, no POST.
- [X] T036 [P] [US4] Write `tests/integration/failure-refresh.bats`: expired creds + OAuth stub returning 401 → exit `20`, log line `[fail] refresh: ...`, no POST. Asserts subsequent runs continue to fail until creds replaced.
- [X] T037 [P] [US4] Write `tests/integration/failure-fetch.bats`: upstream stub returning 404 → exit `30`, log line `[fail] fetch: ...`, no POST.
- [X] T038 [P] [US4] Write `tests/integration/failure-transform.bats`: upstream stub returning JSON missing one of the four required paths → exit `40`, log line `[fail] transform: ...`, no POST.
- [X] T039 [P] [US4] Write `tests/integration/failure-post.bats`: dashboard stub killed before invocation (connection refused on port) → exit `50`, log line `[fail] post: ...`, no POST received anywhere.
- [X] T040 [P] [US4] Write `tests/unit/log-format.bats`: assert every emitted log line matches the regex `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z \[(ok|fail)\] (load|refresh|fetch|transform|post|run): .+$`; assert no log line contains the access_token or refresh_token from `tests/fixtures/credentials.valid.json` (FR-010 + log-format §Secret-redaction rules).

### Implementation for User Story 4

- [X] T041 [US4] Run all six failure-injection tests (T034–T039) plus the log-format test (T040). For each red test, trace back to the responsible step in `scripts/scrape-usage` and fix until green. Most issues will be wrong exit code or missing/extra log line — adjust `log_fail` call sites in T014–T017 + T024–T026 accordingly.
- [X] T042 [US4] Add a defensive trap to `scripts/scrape-usage`: `trap 'log_fail run "unhandled (exit=$?)"; exit 99' ERR` near the top so any uncaught error path produces a `99` per `contracts/exit-codes.md` rather than silent termination.

**Checkpoint**: US4 complete — every failure step has matching exit code + log line, log lines redact secrets, no POST escapes on failure.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T043 [P] Write `install.sh` (≤ 5 lines): substitute `__REPO_PATH__` and `__USER__` in `launchd/com.user.claude-usage-scraper.plist` to produce `~/Library/LaunchAgents/com.user.claude-usage-scraper.plist`, then `launchctl load` it. Print the verify-command from `quickstart.md`.
- [X] T044 [P] Write `uninstall.sh` (≤ 3 lines): `launchctl unload` the installed plist, `rm` the installed plist. Leave the log file alone.
- [X] T045 [P] Run `shellcheck scripts/scrape-usage install.sh uninstall.sh` and resolve every warning. Add a `# shellcheck disable=...` only with a comment explaining why if a warning is intentional.
- [X] T046 Run the full test suite: `bats tests/unit tests/integration`. All tests must pass. If any fail, fix the script and re-run.
- [X] T047 Verify `wc -l scripts/scrape-usage` ≤ 150 (Constitution V). If over, factor out the longest function into a sourced helper in `scripts/lib.sh` or — preferably — delete redundant code rather than splitting files. **129 lines.**
- [ ] T048 Operator dry-run the full quickstart on a real machine: Gate 1 (already done in US3) → Gate 2 (`./install.sh`) → Verify section (`launchctl list | grep claude-usage`, `tail -f` log, dashboard cross-check against live `/usage`). Validate SC-001 (live data within 5 min) and SC-002 (±1pp match) hold. **BLOCKED: requires US3 (operator mitmproxy capture) to land first.**
- [ ] T049 Capture the live-run log from T048 (one `[ok] run: scraped` line per cycle for ≥ 2 cycles) and append it to `specs/001-claude-usage-scraper/quickstart.md` under a new "## Validation log" section as evidence the install procedure works end-to-end. **BLOCKED on T048.**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: starts immediately.
- **Phase 2 (Foundational)**: depends on Phase 1.
- **Phase 3 (US1)**: depends on Phase 2.
- **Phase 4 (US2)**: depends on Phase 3 (extends `main`'s pipeline; reuses log/exit helpers).
- **Phase 5 (US3)**: depends on Phase 2 (only needs the constants block to exist) and is *blocking for live install* but *not blocking for tests against fixtures*. Can run in parallel with Phases 3–4 if a second operator is available.
- **Phase 6 (US4)**: depends on Phases 3 + 4 (failure tests cover both pipelines).
- **Phase 7 (Polish)**: depends on Phases 3 + 4 + 5 + 6. T048+T049 specifically need US3 complete (real endpoint baked in).

### Within-Story Order

- Tests written first; assert they FAIL; then implement; then assert they PASS.
- Fixtures (Phase 2) before any test that consumes them.
- `load` before `refresh` before `fetch` before `transform` before `post` inside `main`.

### Parallel Opportunities

- T002 + T003 (Setup).
- T005 + T006 + T007 + T008 + T009 (Foundational helpers and fixtures — different files).
- T012 + T013 (US1 tests).
- T020 + T021 (US2 tests).
- T034 + T035 + T036 + T037 + T038 + T039 + T040 (US4 tests — all live in different `tests/integration/*.bats` files).
- T043 + T044 + T045 (Polish — different files).

### Cross-Story Independence

- US1 + US2 share `scripts/scrape-usage` so cannot run truly in parallel — they touch the same file. Sequence them.
- US3 only edits the constants block + a fixture + the upstream schema; it can run concurrently with US1/US2 if the operator coordinates which lines they touch.
- US4 is purely test-authoring + log/exit verification; can be staffed independently after US1+US2 land.

---

## Parallel Example: Phase 2 Foundational

```bash
# After T004 lands, fan out the helpers and fixtures:
Task: "T005 Add log_ok / log_fail helpers to scripts/scrape-usage"
Task: "T006 Add redact_token helper to scripts/scrape-usage"
Task: "T007 Create tests/fixtures/credentials.valid.json"
Task: "T008 Create tests/fixtures/credentials.expired.json"
Task: "T009 Create tests/fixtures/upstream-usage.json placeholder"
# T010 (plist) and T011 (test_helper) are independent files — also parallel-safe.
```

> Note: T005 and T006 both edit `scripts/scrape-usage` — they are listed [P] only because they touch disjoint regions. If a single operator is doing both, do them sequentially to avoid merge churn.

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 + Phase 2.
2. Phase 3 (US1) against placeholder fixtures.
3. **STOP**. The script can load creds, hit a stubbed upstream, transform, and POST. That's the MVP for the pipeline.
4. Phase 5 (US3) to make it work against live Anthropic. Now the dashboard shows live numbers.

### Incremental delivery

1. MVP path above (US1 + US3).
2. + US2: now survives token expiry between scrapes.
3. + US4: now fails loud on every step.
4. + Phase 7: now installable and ≤ 150 LoC.

### Single-operator order (recommended)

T001 → T002–T003 (parallel) → T004 → T005–T011 (parallel where disjoint) → T012–T013 → T014–T019 → T020–T021 → T022–T027 → T028–T033 (US3, sequential in spec.md but independent of code) → T034–T040 → T041–T042 → T043–T049.

---

## Notes

- Every task has a concrete file path and a concrete acceptance signal (passing test, file exists with expected content, exit code matches contract).
- Tests are not optional — they are the constitutional smoke-test surface (research §R6).
- The placeholder fixtures (T009) and placeholder constants (T004) exist precisely so US1 can be built and tested before the operator runs mitmproxy. US3 swaps them for real values.
- The script's LoC budget (≤ 150) is enforced at T047. If the budget is busted, the constitutional response is to migrate to a TypeScript CLI, not to add another bash file. Track LoC after every story.
- No commit-after-each-task discipline imposed here; the operator is solo and trunk-based.
