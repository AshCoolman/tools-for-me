# Data Model: Claude Usage Scraper

**Date**: 2026-04-30
**Scope**: Logical entities the scraper reads, transforms, and emits. No database — every entity is a file or an in-flight HTTP payload.

## Entities

### 1. Credential

The OAuth credential bundle stored at `~/.claude/.credentials.json`. Owned jointly by the Claude Code CLI and this scraper; either may rewrite it. Atomic rename is the only safe write discipline.

**Storage**: file at `~/.claude/.credentials.json`, mode `0600`, owned by the operator.

**Fields**:

| Field           | Type        | Required | Notes                                                                                  |
|-----------------|-------------|----------|----------------------------------------------------------------------------------------|
| `access_token`  | string      | yes      | Opaque bearer; never logged                                                            |
| `refresh_token` | string      | yes      | Long-lived; never logged                                                               |
| `expires_at`    | number      | yes      | Unix epoch milliseconds. The scraper compares it against `now()` to decide refresh    |
| `scopes`        | string[]    | no       | Pass-through; not interpreted                                                          |
| `token_type`    | string      | no       | Pass-through; expected to be `Bearer`                                                  |

**Validation rules** (read path):
- The file MUST exist before install (`launchctl load` succeeds even if it doesn't, but the first scrape will fail loud).
- `access_token` and `refresh_token` MUST be non-empty strings.
- `expires_at` MUST be a number; if missing or non-numeric, treat as "expired" and force refresh.

**State transitions**:
- Initial: written by Claude Code at first interactive login.
- Refreshed: written by *this scraper* (or by Claude Code) — `access_token` and `expires_at` change, `refresh_token` may rotate. Atomic rename.
- Revoked: refresh exchange returns 4xx → next scrape and all subsequent scrapes fail until the operator re-auths via interactive `claude`. The file remains on disk but its `refresh_token` no longer authenticates.

**Concurrency model**: Last-writer-wins via atomic rename. A lost write is acceptable because the next scrape will re-evaluate `expires_at` and refresh again if needed.

---

### 2. EndpointConfig

The captured shape of the upstream Anthropic usage endpoint. Not a runtime entity — it is a block of named constants at the top of `scripts/scrape-usage`. Treated as data here because re-discovery (FR-013, SC-006) is a single-file edit of this block.

**Storage**: bash constants in the scraper script, of the form:

```bash
USAGE_URL="https://api.anthropic.com/api/oauth/..."           # captured via mitmproxy
ANTHROPIC_VERSION="2023-06-01"                                # captured
ANTHROPIC_BETA="..."                                          # captured (may be empty)
SESSION_PERCENT_PATH=".session.utilizationPercent"            # jq path; placeholder until R5
SESSION_RESETS_PATH=".session.resetsAt"                       # jq path; placeholder until R5
WEEK_PERCENT_PATH=".week.utilizationPercent"                  # jq path; placeholder until R5
WEEK_RESETS_PATH=".week.resetsAt"                             # jq path; placeholder until R5
```

**Fields**:

| Field                  | Type   | Required | Notes                                                              |
|------------------------|--------|----------|--------------------------------------------------------------------|
| `USAGE_URL`            | string | yes      | Fully-qualified HTTPS URL                                          |
| `ANTHROPIC_VERSION`    | string | yes      | Pinned API version header                                          |
| `ANTHROPIC_BETA`       | string | no       | Empty string if unused; not sent if empty                          |
| `SESSION_PERCENT_PATH` | jq path | yes     | Yields a number 0..100                                             |
| `SESSION_RESETS_PATH`  | jq path | yes     | Yields an ISO-8601 string                                          |
| `WEEK_PERCENT_PATH`    | jq path | yes     | Yields a number 0..100                                             |
| `WEEK_RESETS_PATH`     | jq path | yes     | Yields an ISO-8601 string                                          |

**Validation rules**: Static; verified at script startup with a single `jq -e` probe against the captured fixture during `bats` tests. Production validation is implicit — if any path returns null or an unexpected type, the transform step exits non-zero (FR-008).

**State transitions**: Edited by hand when re-discovery (R5) reveals a new shape; followed by `launchctl unload` + `launchctl load` to pick up the change.

---

### 3. UpstreamUsage (in-flight)

The raw JSON body returned by the Anthropic usage endpoint. Not stored to disk; held in a bash variable for the duration of one scrape, then discarded after `transform`. Embedded into the outgoing snapshot under `raw` for diagnostics.

**Storage**: ephemeral; in the scraper's memory only.

**Fields**: opaque to this spec until R5 discovery completes. The contract (`contracts/upstream-usage.schema.json`) is a placeholder JSON Schema that becomes concrete once the fixture lands at `tests/fixtures/upstream-usage.json`.

**Validation rules**:
- HTTP status MUST be 200. Any other status → fail loud (FR-008).
- Body MUST parse as JSON (`jq -e .` exits 0).
- The four jq paths in `EndpointConfig` MUST each yield a non-null value of the expected type.

---

### 4. UsageSnapshot

The transformed payload POSTed to the local dashboard. Defined entirely by this feature's contract with the dashboard owner; the dashboard does not negotiate.

**Storage**: ephemeral; serialized once and POSTed, then discarded. Not persisted to disk.

**Schema** (JSON):

```json
{
  "session": {
    "percent": 42,
    "resetsAt": "2026-04-30T15:00:00Z"
  },
  "week": {
    "percent": 18,
    "resetsAt": "2026-05-05T00:00:00Z"
  },
  "scrapedAt": "2026-04-30T12:34:56Z",
  "raw": { "...upstream body verbatim..." }
}
```

**Fields**:

| Field             | Type    | Required | Notes                                                                |
|-------------------|---------|----------|----------------------------------------------------------------------|
| `session.percent` | number  | yes      | 0..100, integer or 1-decimal float depending on upstream             |
| `session.resetsAt`| string  | yes      | ISO-8601 UTC, ending in `Z`                                          |
| `week.percent`    | number  | yes      | 0..100                                                               |
| `week.resetsAt`   | string  | yes      | ISO-8601 UTC, ending in `Z`                                          |
| `scrapedAt`       | string  | yes      | ISO-8601 UTC at the moment of upstream call success                  |
| `raw`             | object  | yes      | Verbatim upstream body for the dashboard's debug/diagnostic surface  |

**Validation rules** (write path):
- All five non-`raw` fields MUST be present and well-typed before POST.
- If `transform` cannot produce any of them, the script exits non-zero and emits no POST.

**State transitions**: produced once per scrape cycle; never updated, never re-sent.

---

### 5. SchedulerAgent

The launchd plist that triggers the scraper. Not data the scraper itself reads — it is the deployment artifact that *invokes* the scraper.

**Storage**: `~/Library/LaunchAgents/com.user.claude-usage-scraper.plist`

**Fields** (plist keys that matter):

| Key                  | Value                                                              | Notes                                              |
|----------------------|--------------------------------------------------------------------|----------------------------------------------------|
| `Label`              | `com.user.claude-usage-scraper`                                    | Matches plist filename without extension           |
| `ProgramArguments`   | `["/absolute/path/to/scripts/scrape-usage"]`                       | Absolute path; launchd does not honour `~`         |
| `StartInterval`      | `300`                                                              | seconds                                            |
| `RunAtLoad`          | `true`                                                             | first scrape happens immediately on `launchctl load` |
| `StandardErrorPath`  | `/Users/<operator>/Library/Logs/claude-usage-scraper.log`          | absolute; appended                                 |
| `StandardOutPath`    | (omitted; stdout is unused — POST is the side effect)              |                                                    |
| `EnvironmentVariables` | `{ "PATH": "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin" }` | so `jq` is on PATH inside launchd's sparse env      |

**State transitions**:
- Loaded: `launchctl load <plist>` — agent is registered and will fire per `StartInterval`.
- Unloaded: `launchctl unload <plist>` — agent stops; no scrapes occur.
- Re-loaded (after edit): `launchctl unload && launchctl load`.

---

### 6. LogEntry

One line in `~/Library/Logs/claude-usage-scraper.log` per scrape cycle.

**Storage**: append-only file managed by launchd via `StandardErrorPath`.

**Format**:
```
<ISO8601-utc> [<level>] <step>: <message>
```

| Token       | Domain                                                                         |
|-------------|--------------------------------------------------------------------------------|
| `<level>`   | `ok` \| `fail`                                                                 |
| `<step>`    | `load` \| `refresh` \| `fetch` \| `transform` \| `post` \| `run`               |
| `<message>` | Free-form ASCII; MUST NOT contain access tokens, refresh tokens, or other secrets |

**Validation rules**:
- Exactly one line per scrape cycle (success path: one `ok run` line; failure path: one `fail <step>` line).
- Tokens MUST be redacted. The script's helper logs only the *length* of tokens, never the value.

---

## Entity relationships

```
        ┌──────────────┐  read+atomic-write   ┌────────────────┐
        │  Credential  │◀─────────────────────│  scrape-usage  │─────POST────▶ http://127.0.0.1:8787/api/usage
        └──────────────┘                      └────────────────┘                       │
                                                       │                                ▼
                                                       │                          ┌──────────────┐
                                                       │                          │UsageSnapshot │ (ephemeral)
                                                       │                          └──────────────┘
                                              read     │
                                          ┌────────────┘
                                          ▼
                                   ┌────────────────┐
                                   │ EndpointConfig │  (constants at top of scrape-usage)
                                   └────────────────┘
                                          │
                                          ▼
                       GET https://api.anthropic.com/api/oauth/...  ──▶  UpstreamUsage (ephemeral)
                                                                              │
                                                                              ▼
                                                                       transform via jq
                                                                              │
                                                                              ▼
                                                                       UsageSnapshot

       ┌──────────────────┐  invokes every 300s (RunAtLoad=true)
       │  SchedulerAgent  │──────────────────────────────────▶  scrape-usage
       └──────────────────┘                                            │
                                                                       ▼
                                                              stderr → LogEntry
```

## Open items

- `EndpointConfig` jq paths and `UpstreamUsage` schema are placeholders pending R5 discovery (see `research.md`).
- `LogEntry`'s `<step>` enumeration is fixed by this design and will not grow without a spec amendment.
