# Feature Specification: Claude Usage Scraper (OAuth direct)

**Feature ID**: `001-claude-usage-scraper` (spec directory identifier; this repo is trunk-based on `main`, no feature branch)
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: see `pm/initial-plan.md` — "Every 5 min, call the private Anthropic endpoint Claude Code's `/usage` uses, transform, and POST to `http://127.0.0.1:8787/api/usage`."

**Autonomy Tier**: **High** — fully autonomous once installed. Operator gates only at install, re-auth, and endpoint re-discovery. Failures surface via log + dashboard stale-hint; no silent fallbacks.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Live usage on the local dashboard (Priority: P1)

The operator installs the scraper once. Within 5 minutes, the local dashboard's "Usage" card shows current session and weekly percentages with reset timestamps, replacing its "stale data" hint. The card stays current across operator sessions without further attention.

**Why this priority**: This is the entire point of the feature. Without live data flowing to the dashboard, nothing else matters.

**Independent Test**: Install the scheduler, wait ≤ 5 minutes, observe the dashboard at the local URL. The card transitions from stale-hint footer to live percentages. Cross-check the displayed numbers against running `/usage` inside a live `claude` REPL — they match within rounding.

**Acceptance Scenarios**:

1. **Given** the scheduler is loaded and the operator's credentials are valid, **When** 5 minutes pass, **Then** the dashboard's Usage card shows live session and weekly percentages with `resetsAt` timestamps and a `scrapedAt` no older than the previous scrape interval.
2. **Given** the scheduler is loaded and a scrape has just succeeded, **When** the operator opens the dashboard, **Then** the stale-hint footer is absent and the displayed percentages match a fresh `/usage` invocation within rounding.

---

### User Story 2 - Silent token refresh (Priority: P1)

When the operator's OAuth access token expires between scrapes, the scraper exchanges the refresh token for a new access token, persists the rotated credential atomically, and continues scraping. The operator notices nothing.

**Why this priority**: Tokens expire on the order of hours. Without this, the scraper goes dark within a single workday, defeating the point of automation.

**Independent Test**: Force `expires_at` in the credentials file to a past timestamp (or wait for natural expiry). Trigger the scraper. Verify the credentials file is rewritten with a new `access_token` and a future `expires_at`, and that the resulting POST to the dashboard succeeds.

**Acceptance Scenarios**:

1. **Given** `expires_at` is in the past, **When** the scraper runs, **Then** the refresh exchange succeeds, the credentials file is updated atomically, and the scrape completes against the new token.
2. **Given** `claude` is running concurrently and may itself rewrite credentials, **When** the scraper's refresh writes back, **Then** neither writer corrupts the file (atomic rename guarantees a complete file at every moment).

---

### User Story 3 - Endpoint discovery before install (Priority: P2)

Before installing the scheduler, the operator runs `claude` once through `mitmproxy`, triggers `/usage`, and records the request URL, required headers (including `anthropic-version` and any `anthropic-beta`), and the response shape. These are baked into the scraper.

**Why this priority**: The endpoint is undocumented. Without a reproducible discovery step, the scraper cannot be built or fixed when Anthropic changes the contract.

**Independent Test**: With mitmproxy capturing traffic from a `claude` process configured via `HTTPS_PROXY`, the operator runs `/usage` and observes a single request to an endpoint under `api.anthropic.com` (likely `/api/oauth/...`) with documented headers and a JSON response containing the fields needed to derive session and week percentages plus reset timestamps.

**Acceptance Scenarios**:

1. **Given** mitmproxy is configured and `claude` is launched with `HTTPS_PROXY` pointing to it, **When** the operator runs `/usage` inside `claude`, **Then** the captured request URL, headers, and response shape are sufficient to reproduce the call from `curl`.

---

### User Story 4 - Loud failure, graceful degradation (Priority: P2)

When the upstream endpoint changes shape, the refresh flow breaks, or the dashboard endpoint is unreachable, the scraper exits non-zero, writes a clearly attributable log line, and never posts stale or partial data. The dashboard's own "stale data" hint reappears once its 24-hour staleness threshold passes.

**Why this priority**: The core principle is "fail loud — never silently mask." Stale data on a usage dashboard is worse than no data because it misleads the operator.

**Independent Test**: Inject a failure (revoke the refresh token, point `USAGE_URL` to a 404, stop the dashboard process). Run the scraper. Verify it exits non-zero, the log records the cause, and no POST is sent. Wait 24 hours and observe the dashboard re-display its stale-hint footer.

**Acceptance Scenarios**:

1. **Given** the upstream endpoint returns an unexpected shape, **When** the scraper runs, **Then** it exits non-zero, logs the failure with enough context to attribute it, and does not POST.
2. **Given** the refresh exchange fails, **When** the scraper runs, **Then** it exits non-zero, logs the failure, and does not POST. Subsequent runs continue to fail until the operator re-auths by running `claude` interactively.
3. **Given** the dashboard endpoint is unreachable, **When** the scraper has already fetched a fresh snapshot, **Then** it exits non-zero, logs the failure, and the snapshot is discarded — not retried, not cached.

---

### Edge Cases

- **Concurrent credential writes**: `claude` itself may rotate credentials while the scraper is mid-refresh. Atomic rename guarantees readers never see a half-written file; a lost write is acceptable since the next scrape will refresh again.
- **Slow upstream**: A scrape that runs longer than the 300-second interval may overlap with the next launch. Launchd's `StartInterval` is best-effort; overlap is tolerated and not synchronised.
- **Clock skew**: `expires_at` comparison uses local time; significant skew could cause premature or late refresh. Treat as out of scope — the operator's machine is assumed to have correct time.
- **Plist already loaded**: Re-running `launchctl load` against an already-loaded agent fails with a clear error; the install flow documents the unload-then-load sequence.
- **Endpoint silent change**: If Anthropic changes the response shape without breaking the request contract, the transform step fails loudly (failed `jq` parse). The operator re-runs the discovery step.
- **Stale-hint timing**: The dashboard's existing 24-hour stale-hint policy is unchanged; this feature does not need to signal staleness directly — it just stops POSTing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The scraper MUST run every 300 seconds while the launchd agent is loaded, and MUST also run once at load time.
- **FR-002**: The scraper MUST load OAuth credentials from `~/.claude/.credentials.json`, reading `access_token`, `refresh_token`, and `expires_at`.
- **FR-003**: When `expires_at` is at or before the current time, the scraper MUST exchange the refresh token for a new access token at the documented Anthropic OAuth refresh URL before scraping.
- **FR-004**: After a successful refresh, the scraper MUST write the new credential back to the credentials file using an atomic operation (write to a temporary file in the same directory, then `rename` over the original).
- **FR-005**: The scraper MUST call the discovered Anthropic usage endpoint with `Authorization: Bearer <access_token>`, a pinned `anthropic-version` header, and any `anthropic-beta` header observed during discovery.
- **FR-006**: The scraper MUST transform the upstream response into a snapshot with the shape `{ session: { percent, resetsAt }, week: { percent, resetsAt }, scrapedAt, raw }`, where `scrapedAt` is the ISO-8601 UTC time of the scrape and `raw` is the unmodified upstream response body.
- **FR-007**: The scraper MUST `POST` the snapshot as JSON to `http://127.0.0.1:8787/api/usage`.
- **FR-008**: The scraper MUST exit with a non-zero status on any failure (token load, refresh, upstream call, transform, dashboard POST) and MUST NOT POST stale or partial data on failure.
- **FR-009**: The scraper MUST emit a log line for every run — success or failure — to `~/Library/Logs/claude-usage-scraper.log`, including timestamp, outcome, and on failure the failing step and error message.
- **FR-010**: The scraper MUST NOT log access tokens, refresh tokens, or any other secret material. Logs MUST be safe to share verbatim with the project owner.
- **FR-011**: The launchd plist MUST set `StartInterval = 300`, `RunAtLoad = true`, redirect stderr to the log path in FR-009, and live at `~/Library/LaunchAgents/com.user.claude-usage-scraper.plist`.
- **FR-012**: The install procedure MUST be a single `launchctl load` against the plist; uninstall MUST be a single `launchctl unload`.
- **FR-013**: The endpoint URL, headers, and response field paths discovered via mitmproxy MUST be expressed as named constants in the scraper script so that re-discovery is a single-file edit.
- **FR-014**: The scraper MUST bind only to `127.0.0.1` for the dashboard POST and MUST NOT accept inbound connections.

### Key Entities

- **Credential**: The contents of `~/.claude/.credentials.json`. Holds `access_token`, `refresh_token`, `expires_at`. May be rewritten by either `claude` or this scraper. Atomic rename is the only safe write discipline.
- **Usage Snapshot**: The transformed JSON payload sent to the dashboard. Composed of session percent + reset, week percent + reset, scrape timestamp, and the raw upstream body for diagnostics.
- **Endpoint Config**: The URL, request headers (versioned), and response field paths captured during the discovery step. Baked into the scraper as constants.
- **Scheduler Agent**: The launchd plist that triggers the scraper on its 300-second interval. Persists across reboots once loaded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Within 5 minutes of the operator running the install command, the dashboard's Usage card displays live session and weekly percentages instead of its stale-hint footer.
- **SC-002**: For at least 95% of successful scrapes, the displayed session and week percentages match the values shown by `/usage` in a concurrent live `claude` REPL within ±1 percentage point (rounding tolerance).
- **SC-003**: When the access token expires during normal operation, the next scheduled scrape succeeds without any operator action and the dashboard never displays stale data attributable to the expiry.
- **SC-004**: When any failure occurs (refresh, upstream, transform, dashboard POST), the failure is recorded in the log within the same scrape cycle, and no payload is posted to the dashboard for that cycle.
- **SC-005**: The operator can verify the scheduler is loaded with a single shell command and see a row matching this feature's identifier.
- **SC-006**: Re-discovery of a changed upstream endpoint requires editing only the named constants in the scraper script — no other file changes — and a single unload-then-reload of the scheduler agent.

## Assumptions

- macOS only. Launchd is the scheduler; no Linux/Windows fallback.
- The dashboard at `http://127.0.0.1:8787/api/usage` is maintained separately and accepts the documented snapshot shape. This spec does not own the dashboard contract; if it changes, the transform step is updated accordingly.
- The operator can run `claude` interactively to perform initial endpoint discovery and to re-auth if the refresh flow breaks.
- `mitmproxy` is available locally for the discovery step.
- The Anthropic OAuth refresh URL is reachable from the operator's machine and uses the standard OAuth refresh-token grant.
- History is not persisted by this feature; only the latest snapshot is sent. The dashboard owns whatever history view it wants.
- Log rotation is not handled by this feature; the operator rotates or truncates `~/Library/Logs/claude-usage-scraper.log` manually if it grows too large.
- The scraper is a single-operator tool. No multi-user, multi-host, or shared-credential scenarios.

## Non-Goals

- Cross-platform support (Linux, Windows). macOS-only by constitutional terminal-first/SSH constraint and launchd choice.
- Historical usage storage. Latest snapshot only.
- Authenticated access to the local dashboard endpoint. `127.0.0.1` binding is the entire access control.
- Resilience to Anthropic endpoint changes. By design, the scraper fails loud and waits for the operator to re-discover.
- A retry/backoff layer. A 5-minute interval is the retry layer; transient failures recover on the next cycle.

## Constitution Alignment

- **I. Human Intervenability**: All state is plain files — credentials, log, plist, scraper script. No daemon-internal state.
- **II. Actor Model with Stdio Contracts**: The scraper is a single script invoked by launchd; its only outputs are a POST to the dashboard and a log line.
- **III. Three-Tier Autonomy**: Declared **High**. Risk gates: install (operator opt-in), re-auth (operator runs `claude`), re-discovery (operator edits constants).
- **IV. Terminal-First Interface**: launchd + log file; no GUI required for any operation. The dashboard it feeds is browser-based but secondary; if the dashboard is down, the scraper still fails loud in the log.
