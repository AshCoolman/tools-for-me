# ah — analyze help

Interactive command builder from `--help` output.

`ah` runs `<command> --help`, parses the flags and subcommands, and presents a TUI for composing commands without leaving the terminal.

## Install

```sh
go install github.com/AshCoolman/ah@latest
```

Or build from source:

```sh
git clone https://github.com/AshCoolman/ah.git
cd ah
make install   # installs to ~/bin
```

Requires Go 1.24+.

## Usage

```
ah <command...>                 interactive command builder from --help
ah --dry-run <command...>      print parsed flags/subcommands, no TUI
```

### Examples

```sh
ah docker run    # browse docker run flags
ah git           # pick a git subcommand, then browse its flags
ah curl          # browse curl flags
ah kubectl get   # browse kubectl get flags
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

1. Runs `<command> --help` and captures stdout + stderr
2. Parses flags (`-s, --long <type>  description`) and subcommands (`name  description`)
3. Presents a single-input TUI — the command line is the input, suggestions appear below
4. Handles Docker, curl, git, claude, and other GNU/POSIX-style help formats

## Flags

Flags for `ah` must come before the command:

```
--dry-run     print parsed help, no TUI
--version     print version and exit
-h, --help    show help
```

## Related

- [uh](https://github.com/AshCoolman/uh) — interactive command builder from shell history

## License

MIT
