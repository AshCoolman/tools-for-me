# Implementation Plan: Claude Usage Scraper (OAuth direct)

**Branch**: `main` (trunk; feature ID `001-claude-usage-scraper`) | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-claude-usage-scraper/spec.md`

## Summary

Every 300 seconds, a single bash script (`scripts/scrape-usage`) loads the operator's Anthropic OAuth credentials from `~/.claude/.credentials.json`, refreshes the access token if expired (atomic write-back via tmpfile + rename), calls the private Anthropic usage endpoint discovered out-of-band via `mitmproxy`, transforms the response into a fixed snapshot shape, and POSTs it to `http://127.0.0.1:8787/api/usage`. A `launchd` agent at `~/Library/LaunchAgents/com.user.claude-usage-scraper.plist` schedules the script (`StartInterval=300`, `RunAtLoad=true`) and routes stderr to `~/Library/Logs/claude-usage-scraper.log`. Failure is loud and total: any error path exits non-zero and emits no POST — stale data is forbidden.

## Technical Context

**Language/Version**: Bash (target `/bin/bash` on macOS — Bash 3.2 minimum, no Bash 4+ features)
**Primary Dependencies**: `curl` (system), `jq` (Homebrew, required at install time), `launchd` (system)
**Storage**: Plain files only — `~/.claude/.credentials.json` (read/atomic-rewrite), `~/Library/Logs/claude-usage-scraper.log` (append-only stderr capture); no DB, no SQLite
**Testing**: `bats-core` for shell-level unit and integration tests, with `mitmproxy`-derived fixtures for the upstream response and a stub local listener (`nc` or a 5-line Python responder) for the dashboard POST
**Target Platform**: macOS only (launchd is the scheduler; constitutionally terminal-first)
**Project Type**: single-script CLI tool + launchd plist; no service, no library
**Performance Goals**: Each scrape cycle (refresh probe → upstream call → transform → local POST) completes well under the 300-second interval — practical target ≤ 30s typical, ≤ 120s worst-case
**Constraints**: No secrets in logs (FR-010); atomic credential writes (FR-004); 127.0.0.1-only outbound to dashboard (FR-014); non-zero exit on any failure (FR-008); endpoint constants centralised in one editable block (FR-013)
**Scale/Scope**: Single operator, single host, single credential. No multi-tenancy, no fleet rollout.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Human Intervenability**: All state lives in plain files — credentials JSON, plist XML, log file, bash script. No daemon, no in-memory state. Operator can `cat`, `vim`, `rm` any of them at any time.
- [x] **II. Actor Model with Stdio Contracts**: The scraper is a one-shot process invoked by launchd. Its outputs are (a) stderr → captured by launchd to the log file (the stdio contract), and (b) an HTTP POST to the dashboard. Inputs are (a) the credentials file, (b) the upstream HTTP response. The script has no in-process callers and is replaceable by any other process emitting the same POST shape and writing the same log lines.
- [x] **III. Three-Tier Autonomy**: Spec declares **High**. Risk gates are explicit: install (operator runs `launchctl load`), re-auth (operator runs `claude` interactively when refresh fails), re-discovery (operator edits the named endpoint constants and reloads). Between gates the system is fully autonomous; nothing else needs the human.
- [x] **IV. Terminal-First Interface**: Install, uninstall, verify, re-discover, and read-the-log are all single shell commands. The dashboard the scraper feeds is browser-based but is downstream of this feature and explicitly secondary — if the dashboard process is dead the scraper still fails loud in the log. No browser, no GUI, no IDE in the critical path.
- [x] **V. Simplicity Ceiling**: The full scraper script targets ≤ 150 lines of bash. The plist is ~20 lines of XML. Total surface area below 200 lines. If the script grows beyond 150 lines (e.g. due to error-handling expansion or adding a second endpoint), the next step is refactor to a TypeScript CLI per the principle, not pile on more bash.
- [x] **VI. Provider-Independent Planning Documents**: For this feature, `spec.md` plays the STRATEGY role (evergreen contract: what the scraper guarantees), `plan.md` plays the OPERATION role (current execution plan: how it will be built), and `tasks.md` (Phase 2, generated later) plays the TACTICS role (concrete per-session steps). All three are plain markdown, no provider-specific syntax. Documented here in lieu of three separate STRATEGY/OPERATION/TACTICS files since the feature is small enough to be contained in the speckit triplet.

**Result**: All gates pass. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/001-claude-usage-scraper/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (already authored)
├── research.md          # Phase 0 output — endpoint discovery results, dependency choices
├── data-model.md        # Phase 1 output — Credential, UsageSnapshot, EndpointConfig schemas
├── quickstart.md        # Phase 1 output — install / verify / uninstall / re-discover
├── contracts/           # Phase 1 output — input/output JSON schemas + log/exit-code conventions
│   ├── credential.schema.json
│   ├── upstream-usage.schema.json
│   ├── snapshot.schema.json
│   ├── log-format.md
│   └── exit-codes.md
├── checklists/
│   └── requirements.md  # Already authored — passing
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
claude-token-usage-fragile/
├── scripts/
│   └── scrape-usage              # Single bash entry point, launchd target, ≤150 lines
├── launchd/
│   └── com.user.claude-usage-scraper.plist   # Scheduler; copied to ~/Library/LaunchAgents/ at install
├── tests/
│   ├── fixtures/
│   │   ├── upstream-usage.json   # Captured via mitmproxy during discovery
│   │   ├── credentials.valid.json
│   │   └── credentials.expired.json
│   ├── unit/
│   │   ├── transform.bats        # jq transform: upstream → snapshot
│   │   └── refresh.bats          # token-refresh logic, atomic write
│   └── integration/
│       └── end-to-end.bats       # full pipeline against stubbed upstream + local POST listener
├── install.sh                    # convenience: copy plist, launchctl load
├── uninstall.sh                  # convenience: launchctl unload, remove plist
├── pm/
│   └── initial-plan.md           # Original brief (input to /speckit.specify)
├── specs/
│   └── 001-claude-usage-scraper/  # See above
└── .specify/                     # speckit scaffolding (templates, scripts, memory)
```

**Structure Decision**: Single-script tool layout. Root-level `scripts/`, `launchd/`, `tests/` directories matching the constitution's "shell script first, escalate only on failure" guidance. No `src/`, no `lib/`, no `models/` — those would be premature abstractions for a sub-200-line tool. Tests live in `tests/` because `bats-core` expects that convention. Install/uninstall wrappers at the repo root because they're single-line scripts that aren't worth nesting.

## Complexity Tracking

> All Constitution gates pass on first evaluation. No violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |

## Post-Design Constitution Re-check

Re-evaluated after Phase 1 artifacts (`research.md`, `data-model.md`, `contracts/`, `quickstart.md`) were authored. No artifact introduced new architecture, dependency, or surface area that wasn't already accounted for in the initial check.

- [x] **I. Human Intervenability** — `data-model.md` confirms every entity is a file (Credential, log, plist) or ephemeral (UpstreamUsage, UsageSnapshot); no daemon-internal state.
- [x] **II. Stdio Contracts** — `contracts/log-format.md` and `contracts/exit-codes.md` make the script's outputs explicit and machine-parseable; the script is replaceable by any process honouring those contracts.
- [x] **III. Three-Tier Autonomy** — `quickstart.md` enumerates four operator gates (Discover, Install, Re-auth, Re-discover); between gates the system is fully autonomous per the High tier declaration.
- [x] **IV. Terminal-First** — every quickstart step is a single shell command. No browser is required for any maintenance action.
- [x] **V. Simplicity Ceiling** — design surface is one bash script (target ≤150 lines), one plist (~20 lines), and a small `bats` test layout. No new abstractions added in Phase 1.
- [x] **VI. Provider-Independent Planning** — `spec.md` / `plan.md` / `tasks.md` triple plays the STRATEGY / OPERATION / TACTICS roles; all are plain markdown with no provider-specific syntax.

**Result**: gates still pass. Plan is locked for Phase 2 (`/speckit.tasks`).
