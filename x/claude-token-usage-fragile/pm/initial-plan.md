# Claude Usage Scraper (OAuth direct)

## Goal
Every 5 min, call the private Anthropic endpoint Claude Code's `/usage` uses, transform, and POST to `http://127.0.0.1:8787/api/usage`.

## Prerequisite: discover the endpoint
Run `claude` once through `mitmproxy` (`HTTPS_PROXY=…`). Trigger `/usage`. Record:
- request URL (likely under `api.anthropic.com/api/oauth/...`)
- method + required headers (`authorization`, `anthropic-version`, possibly `anthropic-beta`)
- response shape

Bake URL + shape into the script. Re-discover if Anthropic changes them.

## Components

**1. Token loader**
Read `~/.claude/.credentials.json`. Extract `access_token`, `refresh_token`, `expires_at`. If `expires_at` ≤ now, exchange `refresh_token` against the documented OAuth refresh URL, write the new credential back atomically (tmpfile + rename).

**2. Scrape script (`scripts/scrape-usage`)**
Bash + `curl` + `jq`:
1. Load token (refresh if needed).
2. `curl -fsS -H "authorization: Bearer $TOKEN" -H "anthropic-version: <pinned>" <USAGE_URL>` — capture JSON.
3. `jq` into the dashboard's contract:
   ```json
   {
     "session": { "percent": <n>, "resetsAt": "<ISO>" },
     "week":    { "percent": <n>, "resetsAt": "<ISO>" },
     "scrapedAt": "<ISO>",
     "raw": { ... }
   }
   ```
4. POST to `http://127.0.0.1:8787/api/usage`.

Exit non-zero on any failure — never POST stale or partial data.

**3. Scheduler**
`launchd` agent at `~/Library/LaunchAgents/com.user.claude-usage-scraper.plist`. `StartInterval = 300`, `RunAtLoad = true`, stderr → `~/Library/Logs/claude-usage-scraper.log`. Loaded with `launchctl load`.

## Risks
- **Endpoint drift**: undocumented; may change silently. Failures log loudly; the dashboard's stale-hint footer reappears after 24h.
- **Refresh failure**: if the refresh flow breaks, scraper exits non-zero until you re-auth by running `claude` interactively.
- **Credential surface**: the script reads your auth file. Keep it local; no secrets in commits or logs.
- **Concurrent token writes**: `claude` itself may rewrite credentials during refresh — atomic rename avoids corruption.

## Non-Goals
- Cross-platform — macOS only.
- History — latest snapshot only.
- Local-endpoint auth — `127.0.0.1`-bound.

## Acceptance
1. `launchctl list | grep claude-usage` shows the agent loaded.
2. Within 5 min of install, the "Usage" card replaces the stale-hint footer.
3. Percentages match `/usage` in a live REPL within rounding.
4. After a token refresh, the next scrape succeeds with no manual step.
