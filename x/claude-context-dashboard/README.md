# Claude Context Dashboard

A local web dashboard that visualises every Claude Code session on your machine in one view: per-session context fullness over time on one chart, total token usage on another. Useful when you're juggling several Claude Code sessions and want to know which ones are about to hit the context window.

The dashboard reads Claude Code's session JSONL files from `~/.claude/projects/` and surfaces:

- **Active sessions** — per-session lines of estimated context size over a 1m / 20m / 1h / 6h window, with severity bands (fast / medium / large / critical) at 50k, 150k, and 300k tokens.
- **Token usage** — per-hour input + output + cache tokens, smoothed with a 12-hour rolling average, plus a cumulative line on the right axis.
- **macOS notifications** — when a session crosses 300k tokens, the server fires a native notification (one per breach, until the session drops back down).
- **Plan-limit calibration** — paste the text from Claude Code's `/usage` to seed the per-session and weekly limits, or `POST /api/usage` to the same endpoint from a webhook / scraper.
- **Claude status chip** — polls `status.claude.com` and tints the page when there's an incident.
- **Customizable layout** — every card and column can be hidden via the visibility menu; layout is persisted in `localStorage`.

## Caveat — context fullness is an estimate

Claude Code's JSONL session logs are useful but not guaranteed to reflect the live context window. The dashboard reconstructs context size from the most recent assistant turn's `usage` block (input + output + cache reads + cache creation), or from `compact_boundary` events when the session has been compacted. This is an estimate — every percentage in the UI is labelled `(est.)` for that reason. For a higher-fidelity version, wire in Claude Code's statusline or OTEL output and treat JSONL as historical/session metadata.

## Requirements

- Node.js 20+
- macOS for the notification feature (silently no-ops elsewhere)
- An existing `~/.claude/projects/` directory populated by Claude Code

## Install and run

```bash
npm install
npm run dev
```

Open <http://localhost:8787>.

For a production build:

```bash
npm run build
npm start
```

## Configuration

| Env var | Default | Description |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `CLAUDE_CONTEXT_LIMIT` | `1000000` | Token denominator used for the percentage shown next to each session |

The scanner runs once at startup and then every 10 minutes; the client polls `/api/data` with adaptive backoff (5s for the first 5 minutes, 10s up to 10 minutes, then the idle interval). Idle interval, status-poll interval, and context limit are also editable from the in-app Settings panel and persisted in `localStorage`.

### HTTP endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/data` | Aggregated session + usage data. Supports `?since=<ISO>` for incremental polls. |
| `GET` | `/api/status` | Cached snapshot of `status.claude.com`. |
| `GET` | `/api/usage` | Last payload received on `POST /api/usage`. |
| `POST` | `/api/usage` | Webhook for Claude usage JSON; persisted to `~/.claude-context-dashboard/usage.json` and used to calibrate the per-session and weekly limits in the Token-Usage card. |

### Calibrating plan limits

The Token-Usage card needs to know your per-session and weekly token budget to render correctly. Two ways to set them:

1. Open the dashboard's Settings panel and paste the text from `/usage` (Claude Code) or the Claude usage page. Plan name, session %, weekly %, and reset times are extracted automatically.
2. `POST /api/usage` with the same JSON your tooling already has (any shape — the client parses what it recognises). The dashboard reads the persisted record on next load.

## Security

The server binds to `127.0.0.1` only — it is not reachable from other machines on your network. There is no authentication on `POST /api/usage`; any process on your machine can write to it. Don't expose the port (e.g. via reverse proxy or `--host 0.0.0.0` patch) without putting auth in front.

## How it works

- `src/scanner.ts` — globs `~/.claude/projects/**/*.jsonl`, parses each line, and aggregates per-session usage and "latest context size" per session.
- `src/server.ts` — Fastify server that serves `/api/data` and either Vite middleware (dev) or the built client (prod). Also runs the breach-notification loop.
- `src/client/` — React + d3 dashboard.

## Project layout

```
src/
  server.ts            # Fastify + scheduled scan + macOS notifications + status/usage endpoints
  scanner.ts           # JSONL → aggregated dashboard data
  types.ts             # shared types
  client/
    main.tsx           # React entry; mounts SettingsProvider + FeaturesProvider
    App.tsx            # top-level layout, polling loop, header, status chip, summary KPIs
    SessionsPage.tsx   # active-sessions chart + per-session rows
    Chart.tsx          # generic d3 line/area chart (axes, legend, brush)
    RollingChart.tsx   # 12h rolling-average + cumulative usage chart
    Sparkline.tsx      # per-row context sparkline
    UsageStrip.tsx     # per-session usage strip
    UsageCumStrip.tsx  # cumulative usage strip
    UsageCard.tsx      # token-usage settings: paste calibration + limits + week window
    Features.tsx       # visibility / edit-mode subsystem (toggle cards, save layout)
    Settings.tsx       # context-limit + poll-interval settings (localStorage)
    useElementSize.ts  # ResizeObserver hook
    index.html
    styles.css
```

## License

MIT — see [LICENSE](LICENSE).
