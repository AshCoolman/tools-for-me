# @ashcoolman/claude-token-usage-fragile

Claude Code statusline hook. Reads the rate-limit payload from Claude Code's hook stdin, extracts 5-hour session and 7-day usage percentages, POSTs a snapshot to a local dashboard, and prints a compact status line (`5h:42% 7d:18%`) back to the terminal.

Designed as a companion to [`@ashcoolman/claude-context-dashboard`](../claude-context-dashboard).

**Called "Fragile" as it uses undocumented feature** - Claude Code pipes a JSON payload to that command's stdin on each turn. The payload sometimes includes a rate_limits object with five_hour and seven_day usage percentages.

## Requirements

- bash 3.2+ (macOS system bash is fine)
- `jq` (`brew install jq`)
- `curl` (system)
- `bats-core` for tests (`brew install bats-core`)
- `shellcheck` for verify (`brew install shellcheck`)

## Install

```sh
scripts/start install
```

Registers `scripts/usage-statusline` as the `statusLine` command in `~/.claude/settings.json`. Idempotent — safe to re-run.

## Uninstall

```sh
scripts/start uninstall
```

Removes the `statusLine` entry if it points at this repo's script.

## How it works

1. Claude Code invokes the `statusLine` command, piping a JSON payload to stdin on each turn.
2. `usage-statusline` extracts `rate_limits.five_hour.used_percentage` and `rate_limits.seven_day.used_percentage` via `jq`.
3. If both are present, it builds a snapshot and POSTs it to `http://127.0.0.1:8787/api/usage` (configurable via `DASHBOARD_URL_OVERRIDE`).
4. Prints `5h:N% 7d:N%` to stdout — Claude Code renders this in the status bar.

If the payload lacks rate-limit data (not every turn includes it), the script exits silently or prints only the 5h figure if available.

## Verify

```sh
scripts/start verify
```

Runs shellcheck, bats tests, and a line-of-code gate (usage-statusline must stay under 50 LoC).

## Testing

```sh
scripts/start test
# or directly:
bats tests/unit tests/integration
```

## What ships

```
scripts/
  start              # installer / verifier entry point
  usage-statusline   # the hook itself
tests/
  unit/              # bats unit tests
  integration/       # bats integration tests
  fixtures/          # sample JSON payloads
specs/               # design documents
pm/                  # project management notes
```

## License

MIT — see [LICENSE](LICENSE).
