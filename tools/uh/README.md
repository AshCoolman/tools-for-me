# uh — unwrap history

Interactive command builder from shell history.

`uh` reads your shell history, finds how you've used a command before, and presents a TUI for composing commands from those historical patterns.

## Install

```sh
go install github.com/AshCoolman/uh@latest
```

Or build from source:

```sh
git clone https://github.com/AshCoolman/uh.git
cd uh
make install   # installs to ~/bin
```

Requires Go 1.24+.

## Usage

```
uh <command...>                        interactive command builder from history
uh --dry-run <command...>              print option space summary, no TUI
uh --history-file <path> <command...>  override history file
```

### Examples

```sh
uh git                 # all git invocations from history
uh docker compose      # multi-token: "docker compose" invocations
uh claude --resume     # "claude --resume" invocations
uh --dry-run git       # see flags/values without TUI
```

### TUI keys

| Key | Action |
|---|---|
| Type | Filter suggestions |
| Tab / Enter | Complete suggestion |
| Up / Down | Navigate suggestions |
| Ctrl+X | Execute the composed command |
| Ctrl+Y | Copy to clipboard |
| Esc | Quit |

## How it works

1. Reads your shell history file (`$HISTFILE`, or auto-detects zsh/bash)
2. Filters to lines matching the command prefix you provided
3. Parses each invocation into flags, values, and positionals
4. Ranks by frequency — flags you use most appear first
5. If fewer than 10 matches, widens the search by stripping positional values (skeleton fallback)
6. Presents a single-input TUI — the command line is the input, suggestions appear below

## Flags

Flags for `uh` must come before the command:

```
--dry-run              print option space, no TUI
--history-file <path>  override auto-detected history file
--version              print version and exit
-h, --help             show help
```

## Related

- [ah](https://github.com/AshCoolman/ah) — interactive command builder from `--help` output

## License

MIT
