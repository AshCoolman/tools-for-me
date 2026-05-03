# ashcoolman/tools-for-me

Tools useful to me. Might be useful to you.

A Yarn workspaces monorepo. Packages live under `x/*` and stand alone — pick one, read its README, ignore the rest.

## Contents

| Package | Description |
| --- | --- |
| [`@ashcoolman/leaf-toolkit`](x/leaf-toolkit) | Partition a codebase into bite-sized leaves, rank by priority, drive AI/agent work loops against them with concurrency-safe tool wrappers. |
| [`@ashcoolman/claude-context-dashboard`](x/claude-context-dashboard) | Local dashboard for Claude Code sessions — per-session context fullness and token usage, scanned from `~/.claude/projects` JSONL logs. |

## Layout

```
.
├── x/                    # workspace packages
│   ├── leaf-toolkit/
│   └── claude-context-dashboard/
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
