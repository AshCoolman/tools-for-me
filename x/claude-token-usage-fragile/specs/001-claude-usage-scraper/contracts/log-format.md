# Log Format Contract

**Path**: `~/Library/Logs/claude-usage-scraper.log`
**Writer**: `launchd` via `StandardErrorPath`
**Reader**: the operator (`tail -f`, `grep`)

## One line per scrape cycle

```
<ISO8601-utc> [<level>] <step>: <message>
```

### Token grammar

| Token       | Domain                                                                                        |
|-------------|-----------------------------------------------------------------------------------------------|
| `<ISO8601-utc>` | `YYYY-MM-DDTHH:MM:SSZ` (no fractional seconds, always UTC, always trailing `Z`)           |
| `<level>`   | `ok` \| `fail`                                                                                |
| `<step>`    | `load` \| `refresh` \| `fetch` \| `transform` \| `post` \| `run`                              |
| `<message>` | Free-form ASCII, single line, no tabs. ASCII only — no log-injection-friendly characters.     |

### Step semantics

| Step        | Triggers `fail` line when…                                                                |
|-------------|--------------------------------------------------------------------------------------------|
| `load`      | Credentials file missing, unreadable, or fails JSON parse                                  |
| `refresh`   | Refresh exchange returns non-2xx, or atomic write-back fails                               |
| `fetch`     | Upstream returns non-200, network error, or response body fails JSON parse                 |
| `transform` | Any of the four required jq paths returns null or wrong type                               |
| `post`      | Local dashboard POST returns non-2xx, or connection refused                                |
| `run`       | Catch-all for the success line; not a failure step                                         |

### Success and failure cardinality

- **Success path**: emits exactly one line — `<iso> [ok] run: scraped` — at end of cycle.
- **Failure path**: emits exactly one line — `<iso> [fail] <step>: <reason>` — at the moment of failure, then exits non-zero. No additional lines, no stack traces.

### Examples

```
2026-04-30T12:34:56Z [ok] run: scraped
2026-04-30T12:39:56Z [fail] refresh: exchange returned 401
2026-04-30T12:44:56Z [fail] post: connection refused on 127.0.0.1:8787
2026-04-30T12:49:56Z [fail] transform: session.percent path returned null
```

## Secret-redaction rules

- The script MUST NOT include `access_token`, `refresh_token`, or any substring of either in any log line.
- Token presence MAY be surfaced as a length only — e.g. `loaded credential (access_token len=156)` — but the value MUST NOT appear.
- Any `<message>` text is reviewed at PR time for accidental secret inclusion. Tests assert that a fixture credential does not appear in the captured log output.

## Rotation

Out of scope for this feature. The operator manages rotation manually:
```sh
mv ~/Library/Logs/claude-usage-scraper.log ~/Library/Logs/claude-usage-scraper.log.$(date +%Y%m%d)
launchctl kickstart -k gui/$(id -u)/com.user.claude-usage-scraper
```
