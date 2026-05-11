# claude-context-sparkline

Claude Code statusline wrapper that appends a context-window sparkline to your existing statusline output.

Shows up to 3 bars covering the last ~60 minutes of context usage, colored by threshold:

```
▁▂▃  green  — under 50k tokens
▄▅▆  yellow — 50k–150k tokens
▇█   red    — 150k–300k tokens
█    magenta — over 300k tokens
```

## Install

1. Copy `scripts/usage-statusline` somewhere on your PATH (or reference it directly).

2. Point Claude Code's statusline at it in `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "command": "/path/to/usage-statusline"
  }
}
```

## How it works

The script:
1. Reads the Claude Code statusline JSON from stdin
2. Forwards it to an upstream statusline script (e.g. `claude-token-usage-fragile`) for rate-limit display
3. Extracts `context_window.total_input_tokens` from the JSON
4. Buckets the value into 20-minute windows (keeps last 3 = ~60 min of history)
5. Appends colored sparkline bars to the output

History is stored in `$TMPDIR/claude-ctx-sparkline` (one line per bucket).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `CLAUDE_STATUSLINE_UPSTREAM` | `../../claude-token-usage-fragile/scripts/usage-statusline` (relative) | Path to the upstream statusline script |

## Related

- [claude-token-usage-fragile](../claude-token-usage-fragile) — upstream rate-limit statusline

## License

MIT
