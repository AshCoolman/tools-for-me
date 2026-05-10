# Spec: ah

## Status
- **Phase:** done
- **Owner:** Ash Coolman
- **Created:** 2026-05-10
- **Last advanced:** 2026-05-10 by `/mini-speckit-next` (tasks → done)
- **Effort budget when ready to build:** medium

## Specify - WHAT and WHY
- **Problem:** `uh` builds commands from history — what you've done before. No help when using a flag for the first time. You need to read `--help` output manually, find the flag, then type it. That's a context switch.
- **Outcome:** `ah <command>` runs `<command> --help`, parses the output into flags/subcommands/values, and presents the same single-input TUI as `uh` for composing a command interactively. `ah git` shows git's subcommands; `ah git commit` shows commit's flags.
- **Non-goals:**
  - Man page parsing
  - Sharing a Go module with `uh` (independent tool, may copy TUI code)
  - 100% help-text format coverage — GNU/POSIX convention is the target
  - Auto-detecting whether to use `--help` vs `-h` vs `help` subcommand
- **Success criterion:**
  1. `ah docker run` shows `--rm`, `-v`, `-p`, `-it`, etc. as suggestions from `docker run --help`
  2. `ah git` shows subcommands (commit, push, log, etc.) from `git --help`
- **Threat-model link:** non-coverage / DX-only
- **Constraints:**
  - Separate Go module at `tools/ah/`
  - Same TUI pattern as `uh`: single-input model, suggestions below, tab/enter complete, ^x run, ^y copy, esc quit
  - Runs `<command> --help` (stderr and stdout captured) to get help text
  - Parser must handle common formats: `-f, --flag <value>  description` and variations
  - Must not execute arbitrary commands — only appends `--help` to the user-provided tokens

## Plan - HOW

### Approach

Separate Go module at `tools/ah/`. Copies the TUI from uh (picker.go) with minor adaptations. The new work is the help-text parser.

### Help text parser strategy

Three common help text formats observed in the wild:

1. **Docker/claude/commander style** — flags in an "Options:" block, each line starts with optional whitespace + `-s, --long-flag <type>  description`:
   ```
     -v, --verbose               Make the operation more talkative
         --add-host list         Add a custom host-to-IP mapping
   ```

2. **curl style** — same shape, slightly tighter:
   ```
    -d, --data <data>           HTTP POST data
   ```

3. **git top-level style** — subcommands listed as `   name      description`:
   ```
      clone      Clone a repository into a new directory
      init       Create an empty Git repository
   ```

Parser approach: line-by-line regex matching.

- **Flag line**: `/^\s+(-\w),?\s+(--[\w-]+)(?:\s+(<?\w+>?|\w+))?\s{2,}(.+)/` and variants (long-only, short-only)
- **Subcommand line**: `/^\s{2,}(\w[\w-]*)\s{2,}(.+)/` — only extracted when no flags found (or in a "Commands:" section)
- The parser produces `[]ParsedFlag` and `[]ParsedSubcommand`, which map directly to uh's `model.RankedFlag` and `model.Ranked` types (count=0 since there's no frequency data)

### Architecture / files

```
tools/ah/
├── go.mod
├── go.sum
├── main.go                      # CLI entry, runs command --help, orchestrates
├── main_test.go                 # parseArgs tests
├── Makefile                     # build/install to ~/bin
├── scripts/start                # dev script
├── internal/
│   ├── helpparse/
│   │   ├── parse.go             # help text → flags + subcommands
│   │   └── parse_test.go        # tests against real help text snapshots
│   └── tui/
│       ├── picker.go            # copied from uh, adapted (no history, no skeleton)
│       └── picker_test.go       # copied from uh, adapted
```

### Key differences from uh

| Aspect | uh | ah |
|---|---|---|
| Data source | Shell history file | `<cmd> --help` stdout+stderr |
| Frequency info | Yes (count from history) | No (all flags count=0, or 1) |
| Skeleton fallback | Yes (< 10 results) | No |
| Subcommand detection | From history positionals | From help text section headers |
| Flag descriptions | None | Shown in suggestions |
| Value type hints | From history values | From help text (`<file>`, `string`, `list`) |

### Execution flow

1. `ah docker run` → exec `docker run --help`, capture stdout+stderr
2. Parse help text → `[]ParsedFlag`, `[]ParsedSubcommand`
3. Convert to `model.OptionSpace` equivalent (reuse or mirror the types)
4. If subcommands detected and no flags → subcmd picker phase (same as uh)
5. If flags detected → input phase with suggestions showing flag + description
6. ^x execute, ^y copy, esc quit — same as uh

### Validation

- `go test ./...` passes
- `go build .` compiles
- `./ah docker run` shows docker run flags
- `./ah git` shows git subcommands
- `./ah curl` shows curl flags

### Backward-compat

N/A — new tool.

### Lock-in / rollback

None. Independent module, no shared code at runtime. Delete `tools/ah/` to remove.

## Tasks

### Task 1: Go module scaffold + parseArgs + main entry
- **Files:** `tools/ah/go.mod`, `tools/ah/main.go`, `tools/ah/main_test.go`
- **Success:** `go build .` compiles. `parseArgs` extracts ah flags (--help, --version, --dry-run) before the first positional; everything after is command tokens. `ah <cmd>` execs `<cmd> --help`, captures stdout+stderr combined, and prints the raw text in dry-run mode.
- **Validation:** `cd tools/ah && go test ./... && go build .`
- **Budget:** short

### Task 2: Help text parser — flags
- **Files:** `tools/ah/internal/helpparse/parse.go`, `tools/ah/internal/helpparse/parse_test.go`
- **Success:** `ParseHelp(text)` extracts flags from help output. Handles: `-s, --long <type> desc`, `--long-only <type> desc`, `-s desc` (short-only), long-only without short. Extracts flag name(s), value type hint (string/list/int/`<name>`), description, and isBool. Tests against captured snapshots of `docker run --help`, `curl --help`, and `claude --help`.
- **Validation:** `cd tools/ah && go test ./internal/helpparse/...`
- **Budget:** medium

### Task 3: Help text parser — subcommands
- **Files:** `tools/ah/internal/helpparse/parse.go`, `tools/ah/internal/helpparse/parse_test.go`
- **Success:** `ParseHelp(text)` also extracts subcommands from help output. Detects `<name>  <description>` lines in sections like "Commands:", or git-style grouped subcommand lists. Tests against `git --help` and `docker --help` snapshots.
- **Validation:** `cd tools/ah && go test ./internal/helpparse/...`
- **Budget:** short

### Task 4: TUI — copy from uh + adapt for help data
- **Files:** `tools/ah/internal/tui/picker.go`, `tools/ah/internal/tui/picker_test.go`
- **Success:** TUI shows single-input command line with suggestions from parsed help. Flag descriptions shown inline (dim, after flag name). Subcmd phase works when subcommands detected. Tab/enter complete, ^x execute, ^y copy, esc quit. No history-specific code (no skeleton, no frequency counts beyond 0/1).
- **Validation:** `cd tools/ah && go test ./internal/tui/...`
- **Budget:** short

### Task 5: Wire it together + Makefile + scripts/start
- **Files:** `tools/ah/main.go`, `tools/ah/Makefile`, `tools/ah/scripts/start`
- **Success:** `ah docker run` runs `docker run --help`, parses, launches TUI with flags. `ah git` shows subcommand picker. `ah --dry-run docker run` prints parsed flags without TUI. `make install` puts binary in `~/bin`. `./scripts/start` has interactive menu (build/install/demo).
- **Validation:** `cd tools/ah && go build . && ./ah --dry-run docker run | grep -q '\-\-rm' && ./ah --dry-run git | grep -q 'commit'`
- **Budget:** short

## Implement
- Task 1-5: all implemented in `f3ef050`

## Notes / open questions
- Some tools print help to stderr, some to stdout — capture both
- Some tools use `help` subcommand instead of `--help` (e.g., `go help build`) — out of scope for v1, note for future
- Could later merge `ah` suggestions into `uh` as a secondary source (history + help combined)
