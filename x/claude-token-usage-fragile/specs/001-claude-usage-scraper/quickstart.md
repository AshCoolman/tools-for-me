# Quickstart: Claude Usage Scraper

This is the operator-facing reference. The scraper is fully autonomous between gates; the gates are explicit in this guide.

## Prerequisites

- macOS (Apple Silicon or Intel — both fine)
- A working `claude` CLI install with a valid OAuth login (`~/.claude/.credentials.json` exists)
- `jq` on `PATH`: `brew install jq`
- The local dashboard running and accepting `POST http://127.0.0.1:8787/api/usage` (separate project)
- (For initial setup only) `mitmproxy`: `brew install mitmproxy`

## Gate 1: Endpoint discovery (one time, repeated only on Anthropic-side change)

The Anthropic usage endpoint is undocumented. You capture its shape once via mitmproxy, then bake the URL and field paths into `scripts/scrape-usage`.

1. Start mitmproxy: `mitmweb` (or `mitmdump -w /tmp/usage.flow`)
2. Trust the mitmproxy CA in your keychain (one-time, follows the mitmproxy install docs).
3. Run `claude` with `HTTPS_PROXY=http://127.0.0.1:8080`. In the REPL, type `/usage` and submit.
4. In the mitmproxy view, locate the request to `api.anthropic.com` whose response holds the usage numbers shown in the REPL.
5. Record:
   - The full request URL
   - All request headers (especially `anthropic-version` and any `anthropic-beta`)
   - The response body — save it scrubbed of secrets to `tests/fixtures/upstream-usage.json`
6. Edit the constants block at the top of `scripts/scrape-usage` to reflect the captured URL, version header, beta header, and four jq field paths (`SESSION_PERCENT_PATH`, `SESSION_RESETS_PATH`, `WEEK_PERCENT_PATH`, `WEEK_RESETS_PATH`). All other code stays unchanged.
7. Run the unit test: `bats tests/unit/transform.bats` — should pass against the new fixture.

## Gate 2: Install (one time)

Once the constants block is filled and tests pass:

```sh
./install.sh
```

`install.sh` is a 5-line wrapper that:
1. Substitutes the absolute repo path into `launchd/com.user.claude-usage-scraper.plist`.
2. Copies the rendered plist to `~/Library/LaunchAgents/`.
3. Runs `launchctl load ~/Library/LaunchAgents/com.user.claude-usage-scraper.plist`.

## Verify

Within ~5 minutes of the install, verify that scraping is happening:

```sh
launchctl list | grep claude-usage
# should show:  -  0  com.user.claude-usage-scraper  (PID is - between scrapes; "0" is last exit)

tail -f ~/Library/Logs/claude-usage-scraper.log
# should show one new line every 5 minutes:
# 2026-04-30T12:34:56Z [ok] run: scraped
```

Open the local dashboard. The Usage card should display live percentages and `resetsAt` timestamps within the first scrape cycle. The "stale data" hint should be gone.

Cross-check: run `claude` interactively and type `/usage`. The numbers should match the dashboard within rounding (SC-002).

## Gate 3: Re-auth (when the refresh flow breaks)

If the log starts showing `[fail] refresh: ...` lines repeatedly, the refresh token has been revoked or has expired.

1. Run `claude` interactively and complete the login flow (`/login` or whatever the current Claude Code command is).
2. Confirm `~/.claude/.credentials.json` has a fresh `refresh_token` and a future `expires_at`.
3. The next scheduled scrape will pick up the new credentials automatically. No reload of the launchd agent is needed; nothing about the agent's state has changed.

## Gate 4: Re-discovery (when Anthropic changes the endpoint)

If the log starts showing `[fail] fetch: ...` (e.g. 404, 401 with valid token, or a JSON parse error) or `[fail] transform: ...` consistently, the endpoint has likely changed shape.

1. Repeat **Gate 1** with a fresh mitmproxy capture.
2. Update the constants block in `scripts/scrape-usage`.
3. Reload:
   ```sh
   launchctl unload ~/Library/LaunchAgents/com.user.claude-usage-scraper.plist
   launchctl load   ~/Library/LaunchAgents/com.user.claude-usage-scraper.plist
   ```
4. `tail -f` the log until `[ok] run: scraped` reappears.

## Uninstall

```sh
./uninstall.sh
```

Equivalent to:
```sh
launchctl unload ~/Library/LaunchAgents/com.user.claude-usage-scraper.plist
rm ~/Library/LaunchAgents/com.user.claude-usage-scraper.plist
```

The log file is left in place for forensic review; delete it manually if desired:
```sh
rm ~/Library/Logs/claude-usage-scraper.log
```

## Troubleshooting

| Symptom                                                      | Likely cause                                              | Fix                                                       |
|--------------------------------------------------------------|-----------------------------------------------------------|-----------------------------------------------------------|
| `launchctl list` shows the agent but no log lines appear     | `StandardErrorPath` is mistyped or unwritable             | Check the plist; ensure `~/Library/Logs/` exists          |
| Log shows `[fail] load: jq: command not found`               | `jq` not on launchd's `PATH`                              | Confirm `EnvironmentVariables.PATH` in the plist          |
| Log shows `[fail] post: connection refused on 127.0.0.1:8787` | Dashboard process is down                                 | Start the dashboard; next cycle will succeed              |
| Log shows `[fail] refresh: exchange returned 401`            | Refresh token revoked                                     | Run **Gate 3** (re-auth)                                  |
| Log shows `[fail] transform: ... path returned null`         | Anthropic endpoint shape changed                          | Run **Gate 4** (re-discovery)                             |
| Dashboard shows "stale data" hint                            | No successful scrape in 24 hours                          | Check the log for the most recent `[fail]` line and treat |

## Quick reference: file locations

| File                                                           | Purpose                                  |
|----------------------------------------------------------------|------------------------------------------|
| `scripts/scrape-usage`                                         | The scraper. Edit constants block only. |
| `launchd/com.user.claude-usage-scraper.plist`                  | Source plist (template for install)     |
| `~/Library/LaunchAgents/com.user.claude-usage-scraper.plist`   | Installed plist (loaded by launchd)     |
| `~/Library/Logs/claude-usage-scraper.log`                      | Per-cycle log lines                     |
| `~/.claude/.credentials.json`                                  | OAuth credentials (read by scraper, rewritten on refresh) |
| `tests/fixtures/upstream-usage.json`                           | Captured upstream response (used by tests) |
