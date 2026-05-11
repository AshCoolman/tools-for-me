# ashcoolman/tools-for-me

Tools useful to me. Might be useful to you.

A Yarn workspaces monorepo. Packages live under `x/*` and standalone Go tools under `tools/*` — pick one, read its README, ignore the rest.

## Contents

| Package | Description |
| --- | --- |
| [`@ashcoolman/leaf-toolkit`](x/leaf-toolkit) | Partition a codebase into bite-sized leaves, rank by priority, drive AI/agent work loops against them with concurrency-safe tool wrappers. |
| [`@ashcoolman/claude-context-dashboard`](x/claude-context-dashboard) | Local dashboard for Claude Code sessions — per-session context fullness and token usage, scanned from `~/.claude/projects` JSONL logs. |
| [`@ashcoolman/claude-token-usage-fragile`](x/claude-token-usage-fragile) | Claude Code statusline hook — shows 5h/7d token usage percentage, POSTs snapshots to a local dashboard. |
| [`@ashcoolman/claude-context-sparkline`](x/claude-context-sparkline) | Claude Code statusline wrapper — adds a 3-bar context-window sparkline colored by token usage thresholds. |
| [`@ashcoolman/mini-speckit`](x/mini-speckit) | Lightweight, opt-in specify-plan-tasks-implement lifecycle for single-doc deliverables. Lower-ceremony alternative to full Spec Kit. |

## Tools

Standalone Go CLIs. Each has its own `go.mod` — no Node/Yarn dependency.

| Tool | Description |
| --- | --- |
| [`uh`](tools/uh) | Interactive command builder from shell history. Parses past invocations, ranks flags by frequency, presents a TUI for composing commands. |
| [`ah`](tools/ah) | Interactive command builder from `--help` output. Parses flags and subcommands from any GNU/POSIX-style CLI. |

## Layout

```
.
├── x/                    # workspace packages (Node/TS)
│   ├── leaf-toolkit/
│   ├── claude-context-dashboard/
│   ├── claude-context-sparkline/
│   ├── claude-token-usage-fragile/
│   └── mini-speckit/
├── tools/                # standalone CLIs (Go)
│   ├── uh/
│   └── ah/
├── package.json          # workspace root
├── lerna.json
├── .yarn/                # yarn 1.22.1 binary + plugins
└── .husky/               # git hooks
```

## Setup

Requires Node `>=20` and Yarn 1.x (pinned via `packageManager`).

```sh
yarn install
```

`prepare` wires husky hooks automatically.

## License

MIT — see [LICENSE](LICENSE).
