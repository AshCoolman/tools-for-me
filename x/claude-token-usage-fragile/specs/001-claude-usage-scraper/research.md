# Phase 0 Research: Claude Usage Scraper

**Date**: 2026-04-30
**Status**: Initial — endpoint capture pending operator mitmproxy run; all other decisions resolved.

## Open unknowns from Technical Context

The Technical Context in `plan.md` declares no `NEEDS CLARIFICATION` markers. All remaining unknowns are *external* — they cannot be resolved by reading or web research, only by the operator running the discovery procedure (User Story 3, FR-013). They are listed in §5 below as deferred-to-discovery rather than unresolved blockers.

## Research items

### R1. macOS Bash version target

**Decision**: Target Bash 3.2 features only. Shebang `#!/bin/bash`. Avoid associative arrays (`declare -A`), `mapfile`/`readarray`, `${var,,}` lowercase expansion, and `[[ =~ ]]` capture-group semantics that differ from Bash 3.2.

**Rationale**: macOS ships Bash 3.2 as `/bin/bash` and Apple has not upgraded it (newer Bash is GPLv3-licensed). Homebrew installs Bash 5.x at `/usr/local/bin/bash` or `/opt/homebrew/bin/bash`, but launchd agents that depend on Homebrew Bash break for any operator who hasn't installed it or whose `PATH` differs. Sticking to system Bash 3.2 keeps the install procedure to one `launchctl load` with zero environment assumptions.

**Alternatives considered**:
- **`#!/usr/bin/env bash`** — picks up whatever Bash is first on `PATH`. Rejected: launchd's environment is sparse and `PATH` is often `/usr/bin:/bin:/usr/sbin:/sbin`, which gets system Bash anyway, but the mismatch between dev shell (Bash 5 from brew) and launchd shell (Bash 3.2) becomes a debugging trap.
- **Rewrite in Python or Node** — rejected at this stage. The spec is explicit about a single-script bash tool. If the script grows past 150 lines per Constitution V, *then* migrate.

---

### R2. Credential file atomic write discipline

**Decision**: Write to a tmpfile in the same directory as `~/.claude/.credentials.json` (so `rename` is atomic on the same filesystem), `chmod 600` the tmpfile, then `mv -f` over the original. No advisory lock — atomicity is provided by the rename, and `claude` itself uses the same pattern (verified by inspecting Claude Code's open-source token rotation in prior versions; if `claude` and the scraper both rotate simultaneously, the latest writer wins and the loser's update is lost — acceptable per spec edge case "Concurrent credential writes").

**Rationale**: POSIX guarantees `rename(2)` atomicity for paths on the same filesystem. `mv -f` calls `rename(2)` directly when source and destination are on the same filesystem. A reader that opens the credentials file at any moment will see either the pre-rename or post-rename contents in full — never a half-written file. This is the canonical pattern; no need for `flock` or lock files.

**Alternatives considered**:
- **`flock`** — adds a lock file the operator must reason about; doesn't compose with `claude`'s independent writes since `claude` won't take the same lock; provides no benefit over atomic rename for this concurrency model.
- **In-place write with `> "$file"`** — rejected outright; this is the failure mode the spec calls out (FR-004).
- **Symlink swap** — atomic but adds an extra indirection that breaks `claude`'s expectation that `~/.claude/.credentials.json` is a regular file.

---

### R3. Token refresh trigger

**Decision**: Refresh only when `expires_at <= now()`. No proactive skew margin. If `expires_at` is missing, malformed, or in the future, treat the access token as valid and proceed.

**Rationale**: Adding a skew margin (e.g. "refresh if `expires_at - now < 60s`") trades correctness for a tiny latency win that doesn't matter at a 300s scrape cadence. If the access token is rejected mid-scrape (HTTP 401 from upstream), the script fails loud per FR-008 and the next scheduled run will see the updated `expires_at` (assuming `claude` rotated) or refresh itself. Simpler is correct.

**Alternatives considered**:
- **Always refresh before every scrape** — rejected: wastes the refresh-token budget and adds a ~200ms network hop for no benefit.
- **Refresh on 401 from upstream with retry** — rejected for v1: adds branching complexity (need to remember whether we already refreshed this cycle to avoid loops). Defer until/unless field evidence shows the simple "refresh on expiry only" path produces too many failed cycles.

---

### R4. jq dependency

**Decision**: Hard requirement. Install procedure (quickstart) checks for `jq` in `PATH` and refuses to install the launchd agent if absent. The script itself shells out to `jq` directly with no fallback.

**Rationale**: The transform step (FR-006) and the credential extraction step both need a real JSON parser. Hand-rolling JSON parsing in Bash 3.2 violates the Simplicity Ceiling more than the dependency does. `jq` is a single Homebrew install (`brew install jq`) and is already standard on developer macOS hosts.

**Alternatives considered**:
- **Python one-liners (`python3 -c 'import json; ...'`)** — viable but introduces two parsers (Python for input, jq-style for transform) which is worse than picking one. Also Python startup latency (~80ms cold) is non-trivial when the script invokes JSON ops 4–5 times per scrape.
- **`grep`/`sed` JSON extraction** — rejected: fragile, brittle to whitespace and key order, exactly the kind of "smart bash" that the Simplicity Ceiling principle exists to prevent.

---

### R5. Upstream endpoint discovery (deferred to operator)

**Decision (procedural)**: The operator performs the discovery step (User Story 3) before the launchd agent can be installed. The artifact required is a captured request/response pair stored in `tests/fixtures/upstream-usage.json` plus the URL, headers, and a documented field-path mapping that becomes the constants block at the top of `scripts/scrape-usage`.

**Status**: **Pending** — must be completed as the first concrete task in `/speckit.tasks`. Without it, the contracts in `contracts/upstream-usage.schema.json` are placeholders.

**Rationale**: The endpoint is undocumented and may change without notice; the spec accepts this and treats re-discovery as an operator gate (Constitution III: High autonomy with explicit risk gates). Building the script around speculative endpoint shape would force a rewrite once the real shape is captured.

**What the discovery step must produce**:
- The exact request URL (likely `https://api.anthropic.com/api/oauth/...` per the initial plan)
- HTTP method (likely `GET`)
- Required headers — at minimum `authorization: Bearer <token>`, `anthropic-version: <pinned>`, possibly `anthropic-beta: <feature>`
- Response body shape — specifically the field paths that yield session-percent, session-resets-at, week-percent, week-resets-at
- A captured response saved to `tests/fixtures/upstream-usage.json` with secrets scrubbed

**Alternatives considered**:
- **Reverse-engineer from Claude Code's open source** — rejected: Claude Code's `/usage` slash command implementation isn't part of the open source surface we can rely on; even if it were, the runtime call shape is what matters and is best captured directly.

---

### R6. Test framework: `bats-core`

**Decision**: Use `bats-core` (`brew install bats-core`) for both unit and integration tests under `tests/`. Unit tests cover the `jq` transform and the refresh logic in isolation using fixtures. Integration tests run the full script end-to-end against a stubbed upstream (a local HTTP responder bound to 127.0.0.1 on a random port) and a stubbed dashboard listener.

**Rationale**: `bats-core` is the standard for shell test frameworks, integrates cleanly with `make test` or direct `bats tests/`, and produces TAP output compatible with CI. Constitution: Architecture Constraints requires "smoke test that can be run without a live AI provider" — a stubbed upstream satisfies this.

**Alternatives considered**:
- **Plain shell scripts as tests** — works but lacks fixture isolation, setup/teardown, and assertion helpers; would re-invent `bats-core` poorly.
- **Hand-rolled Python test runner** — adds a second language for tests-only, violates Simplicity Ceiling.

---

### R7. Local stub for the dashboard endpoint (test-only)

**Decision**: Use a 5-line Python `http.server` subclass bound to `127.0.0.1` on a random port, started in test setup and killed in teardown. The script's `DASHBOARD_URL` constant is overridden via env var (`DASHBOARD_URL_OVERRIDE`) for testing only — production is hardcoded to `http://127.0.0.1:8787/api/usage`.

**Rationale**: Tests must validate the POST shape and headers without depending on the real dashboard being up. A tiny Python responder is one of the few cases where Python beats Bash for clarity (5 lines vs. ~20 of `nc` plumbing).

**Alternatives considered**:
- **`nc -l` listener** — works but parsing the HTTP request out of `nc` is fiddly and Bash-3.2-hostile.
- **Mock with `curl --resolve`** — doesn't help; we need to verify the POST was received with the expected body, which requires a real listener.

---

### R8. Log format and rotation

**Decision (format)**: One line per scrape cycle, structured as:
```
<ISO8601-utc> [<level>] <step>: <message>
```
where `<level>` ∈ `{ok, fail}`, `<step>` ∈ `{load, refresh, fetch, transform, post, run}`, and `<message>` is a short attribution string. Successful runs emit a single `[ok] run: scraped` line; failed runs emit one `[fail] <step>: <reason>` line.

**Decision (rotation)**: Out of scope. Spec assumption: "the operator rotates or truncates the log manually if it grows too large." Document in quickstart.

**Rationale**: Structured-but-grep-friendly log lines satisfy the spirit of the constitution's TODO(TELEMETRY) without committing to a real log shipper. One line per cycle keeps log volume bounded (~500 bytes × 288 cycles/day ≈ 150 KB/day worst case).

**Alternatives considered**:
- **JSON Lines** — overkill for a single-script tool the operator will mostly `tail -f` by hand.
- **Use `os_log`/`logger`** — couples to macOS log infrastructure and makes the log harder to share verbatim with the project owner per FR-010.

---

## Resolved decisions summary

| ID  | Topic                          | Decision                                                                           |
|-----|--------------------------------|------------------------------------------------------------------------------------|
| R1  | Bash version                   | Bash 3.2, `/bin/bash` shebang                                                      |
| R2  | Credential atomic write        | tmpfile + `mv -f` rename, `chmod 600`, no lock                                     |
| R3  | Token refresh trigger          | Refresh iff `expires_at <= now()`; no skew margin                                  |
| R4  | jq dependency                  | Hard requirement; install-time check                                               |
| R5  | Upstream endpoint              | **Deferred to operator discovery** — first task in `/speckit.tasks`                |
| R6  | Test framework                 | `bats-core`                                                                        |
| R7  | Local dashboard stub for tests | 5-line Python `http.server` subclass, env-var override                             |
| R8  | Log format / rotation          | `<iso> [level] <step>: <msg>`; rotation deferred to operator                       |

## Outstanding NEEDS CLARIFICATION

None. R5 is a deferred external action by the operator, not an unresolved spec ambiguity.
