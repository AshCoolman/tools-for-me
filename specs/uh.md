# Spec: uh

## Status
- **Phase:** done
- **Owner:** Ash Coolman
- **Created:** 2026-05-08
- **Last advanced:** 2026-05-08 by `/mini-speckit-next`
- **Pillar:** DX
- **Effort budget when ready to build:** medium

## Specify - WHAT and WHY
- **Problem:** Reconstructing a command you ran last week means scrolling through history or guessing flags. `history | grep X` gets you raw lines — you still have to eyeball which flags go together, what the positional args were, and mentally recombine them.
- **Outcome:** `uh <base-command>` reads shell history, filters to invocations of that command, parses each into flags/args, deduplicates the option space, and presents an interactive picker to compose and execute a new invocation from observed options.
- **Non-goals:**
  - Not a history replacement (Atuin, McFly, hstr). No SQLite, no sync, no ranking model.
  - Not a shell plugin or prompt integration — standalone CLI only.
  - Not a command reference or man-page parser. Only works from what you actually ran.
- **Success criterion:**
  1. `uh git` shows an interactive builder populated from real history entries containing `git`.
  2. Selecting options produces a runnable command string that can be copied or executed.
- **Threat-model link:** non-coverage / DX-only
- **Constraints:**
  - Must read standard shell history files (`~/.bash_history`, `~/.zsh_history`, `$HISTFILE`).
  - Go binary. Single static binary, zero runtime deps, cross-compilable.
  - TUI stack: `bubbletea` + `bubbles` (charmbracelet).
  - Must handle flag-value pairs (`--flag value`, `--flag=value`, `-f value`), boolean flags, and positional args as distinct option types.
  - Output: copy-pasteable command string, with optional direct execution.

## Plan - HOW

- **Approach:** Go module at `tools/uh/`. Isolated from the npm monorepo — not a yarn workspace, not referenced by `package.json`. Go version pinned via `mise` (`.mise.toml` at `tools/uh/`). Single `main.go` entry point with internal packages for history parsing, command modeling, and TUI. The pipeline is: read history file → filter lines by base command → parse each line into a structured invocation (subcommand, flags, flag-values, positional args) → deduplicate and frequency-rank the option space → present a bubbletea inline picker → assemble and output/execute the composed command.

- **Surface:**
  - `uh <tokens...>` — main entry point; accepts one or more tokens (e.g. `uh docker compose`)
  - `uh <tokens...> --dry-run` — print composed command without executing
  - `uh <tokens...> --copy` — copy to clipboard instead of executing
  - `uh --history-file <path>` — override auto-detected history file
  - No config files, no env vars beyond `$HISTFILE`.

- **Files to add/modify:**
  - `tools/uh/.mise.toml` — pins Go version (e.g. `go = "1.24"`)
  - `tools/uh/go.mod` — module init
  - `tools/uh/main.go` — CLI entry, flag parsing (stdlib `flag` — minimal deps)
  - `tools/uh/internal/history/reader.go` — detect and read `~/.zsh_history`, `~/.bash_history`, or `$HISTFILE`; strip zsh timestamp prefix (`: 1234567890:0;`)
  - `tools/uh/internal/history/reader_test.go` — unit tests with fixture history files
  - `tools/uh/internal/parser/parse.go` — tokenize a command string into `Invocation{Base, Subcommand, Flags, FlagValues, Positionals}`; handle `--flag value`, `--flag=value`, `-f value`, boolean flags, combined short flags (`-abc`)
  - `tools/uh/internal/parser/parse_test.go` — table-driven tests
  - `tools/uh/internal/model/options.go` — aggregate parsed invocations into an `OptionSpace` (deduplicated flags, frequency-ranked values, observed subcommands)
  - `tools/uh/internal/model/options_test.go`
  - `tools/uh/internal/tui/picker.go` — bubbletea model: single flat list, inline step-in/step-out, persistent preview bar
  - `tools/uh/internal/tui/picker_test.go` — tea.Msg-based tests

- **Validation matrix:**
  | Check | Command |
  |---|---|
  | Module compiles | `cd tools/uh && go build ./...` |
  | Tests pass | `cd tools/uh && go test ./...` |
  | Binary runs | `cd tools/uh && go run . git --dry-run` |
  | zsh history parsed correctly | unit test with `: 1234567890:0;git commit -m "foo"` fixture |
  | Flag combos deduplicated | unit test asserting `--verbose` appears once with count |

- **Monorepo isolation:**
  - `tools/uh/` is not a yarn workspace. Not referenced by root `package.json` or `yarn.lock`.
  - Go version managed by `mise` (`.mise.toml` local to `tools/uh/`). NPM-only contributors never need Go.
  - CI: separate job for Go builds, only triggered by `tools/uh/**` changes.
  - A `scripts/push-tool.sh uh` script (future task) mirrors `tools/uh/` to a standalone read-only repo via `git subtree push` for external consumers to fork.

- **Backward-compat:** N/A — new tool, no existing users.

- **Lock-in:** Go stdlib + charmbracelet bubbletea/bubbles. bubbletea is MIT, widely adopted, maintained. No vendor lock-in.

- **Rollback:** Delete `tools/uh/`.

## Scenarios

### 1. Basic subcommand picker

You used `docker` a lot last week but can't remember the exact `run` flags.

One flat list. Preview pinned at the bottom, updates live. `space` steps into a flag to resolve its value inline, then cursor advances to the next row. No separate screens.

```
$ uh docker

  uh · unwrap history · 47 invocations of "docker"

    run          (23×)
    build        (11×)
    compose up   (8×)
    ps           (5×)

  ─── preview ───────────────────────────
  docker ▊
  ──── [space] select  [q] quit ─────────
```

Press `space` on `run` — subcommand locks in, flag list replaces it inline:

```
  uh · unwrap history · 23 invocations of "docker run"

    --rm                      (20×)
    -it                       (18×)
    -d                        (7×)
  > -v                        (14×)    ← cursor here
    --network                 (3×)
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
    node:18-alpine            (11×)
    postgres:15               (6×)

  ─── preview ───────────────────────────
  docker run --rm -it ▊
  ──── [space] step in  [x] toggle  [enter] done  [q] quit ──
```

Boolean flags (`--rm`, `-it`, `-d`) toggle with `x`. Flags that take values show a `>` affordance. Press `space` on `-v` to step in:

```
  uh · unwrap history · 23 invocations of "docker run"

    --rm                      (20×)
    -it                       (18×)
    -d                        (7×)
  ∨ -v                        (14×)
      > $(pwd):/app           (9×)    ← inline sub-list
        ~/.config:/config     (5×)
    --network                 (3×)
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
    node:18-alpine            (11×)
    postgres:15               (6×)

  ─── preview ───────────────────────────
  docker run --rm -it -v ▊
  ──── [space] select  [esc] back  [q] quit ──
```

`space` on a value locks it in, collapses the sub-list, cursor moves to `--network`:

```
    --rm                    ✓ (20×)
    -it                     ✓ (18×)
    -d                        (7×)
    -v $(pwd):/app          ✓ (14×)
  > --network                 (3×)    ← cursor advanced here
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
    node:18-alpine            (11×)
    postgres:15               (6×)

  ─── preview ───────────────────────────
  docker run --rm -it -v $(pwd):/app ▊
  ──── [space] step in  [x] toggle  [enter] done  [q] quit ──
```

Below the `┄┄` divider are positional args — same mechanic. `enter` on any screen finalizes:

```
  ─── preview ───────────────────────────
  docker run --rm -it -v $(pwd):/app node:18-alpine
  ──── [enter] execute  [c] copy  [e] edit  [q] quit ──
```

### 2. Flat command (no subcommands)

No subcommand detected — opens straight to the flag list.

```
$ uh curl

  uh · unwrap history · 12 invocations of "curl"

    -s                        (10×)
  > -H                        (8×)    ← cursor here
    -X                        (4×)
    -o                        (3×)
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
    https://api.example.com/v1/users (3×)
    http://localhost:3000/health      (4×)

  ─── preview ───────────────────────────
  curl -s ▊
  ──── [space] step in  [x] toggle  [enter] done  [q] quit ──
```

`space` on `-H` — repeatable flag (observed up to 2× per invocation), so the sub-list allows multi-select:

```
  ∨ -H                        (8×)
      [x] "Authorization: Bearer $TOKEN"   (6×)
      [x] "Content-Type: application/json" (5×)

  ─── preview ───────────────────────────
  curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" ▊
  ──── [x] toggle  [esc] back  [q] quit ──
```

`esc` collapses, cursor moves to `-X`. Repeatable flags get `[x]` multi-toggle in their sub-list; single-value flags get `space`-to-pick.

### 3. Dry-run and copy modes

```
$ uh git --dry-run
git rebase --interactive --autosquash origin/main

$ uh kubectl --copy
# "kubectl logs -f --tail=100 deploy/api" copied to clipboard
```

`--dry-run` prints the composed command to stdout and exits (no TUI). `--copy` runs the picker but sends the result to the clipboard instead of executing.

### 4. No matches

```
$ uh rutabaga
uh: no history entries found for "rutabaga"
```

Clean exit, no TUI, exit code 1.

## Tasks

### Task 1 — Project scaffold and mise setup
- **Files:** `tools/uh/.mise.toml`, `tools/uh/go.mod`, `tools/uh/main.go`, `tools/uh/.gitignore`
- **Success:** `cd tools/uh && mise install && go build ./...` exits 0. Binary prints usage and exits.
- **Validation:**
  - `cd tools/uh && go build -o uh .`
  - `cd tools/uh && ./uh --help` prints usage
- **Budget:** short

### Task 2 — History reader
- **Files:** `tools/uh/internal/history/reader.go`, `tools/uh/internal/history/reader_test.go`, `tools/uh/internal/history/testdata/`
- **Success:** Reads `~/.zsh_history` (stripping `: 1234567890:0;` prefix), `~/.bash_history`, or `$HISTFILE`. Filters lines by base command. Returns `[]string` of raw command strings.
- **Validation:**
  - `cd tools/uh && go test ./internal/history/...`
  - Test fixtures cover: zsh timestamped format, plain bash format, empty file, no matches
- **Budget:** short

### Task 3 — Command parser
- **Files:** `tools/uh/internal/parser/parse.go`, `tools/uh/internal/parser/parse_test.go`
- **Success:** Parses a raw command string into `Invocation{Base, Subcommand, Flags[]Flag, Positionals[]string}`. Each `Flag` has `Name`, `Values[]string`, `IsBool`. Handles `--flag value`, `--flag=value`, `-f value`, boolean flags, combined short flags (`-abc`).
- **Validation:**
  - `cd tools/uh && go test ./internal/parser/...`
  - Table-driven tests: `git commit -m "foo"`, `docker run --rm -it -v $(pwd):/app node:18`, `curl -sH "Auth: Bearer $T" -o out.json https://x.com`, `ls -la`
- **Budget:** short

### Task 4 — Option space model
- **Files:** `tools/uh/internal/model/options.go`, `tools/uh/internal/model/options_test.go`
- **Success:** Aggregates `[]Invocation` into `OptionSpace{Subcommands[]Ranked, Flags[]RankedFlag, Positionals[]Ranked}`. Deduplicates. Frequency-ranks. Detects repeatable flags (same flag 2×+ in a single invocation). Distinguishes boolean vs value flags.
- **Validation:**
  - `cd tools/uh && go test ./internal/model/...`
  - Test: 10 `docker run` invocations → `--rm` count=8, `-v` values ranked by frequency, `-H` marked repeatable
- **Budget:** short

### Task 5 — TUI picker (bubbletea)
- **Files:** `tools/uh/internal/tui/picker.go`, `tools/uh/internal/tui/picker_test.go`
- **Success:** Flat list with inline step-in/step-out per Scenario 1. Persistent preview bar. Keys: `space` step in / select value, `x` toggle boolean, `esc` collapse, `enter` finalize, `c` copy, `e` edit, `q` quit. Accepts `OptionSpace` as input, returns composed command string.
- **Validation:**
  - `cd tools/uh && go test ./internal/tui/...`
  - Manual: `cd tools/uh && go run . docker` with mocked data shows the inline picker
- **Budget:** medium

### Task 6 — Wire it up + end-to-end
- **Files:** `tools/uh/main.go`
- **Success:** `uh <cmd>` reads real history, parses, models, launches TUI. `--dry-run` prints to stdout. `--copy` sends to clipboard. `--history-file` overrides detection. Exit code 1 on no matches with message.
- **Validation:**
  - `cd tools/uh && go build -o uh . && ./uh git --dry-run`
  - `cd tools/uh && ./uh rutabaga` exits 1 with error message
- **Budget:** short

## Implement
- Task 1 — `f20c0a5`
- Task 2 — `fd3480c`
- Task 3 — `d69f38d`
- Task 4 — `8398a75`
- Task 5 — `22bcabc`
- Task 6 — `5d3f4c1`

## Notes / open questions
- **Decided:** lives at `tools/uh/` in this monorepo. Mirrored to a standalone read-only repo via subtree push.
- **Decided:** Go + bubbletea/bubbles. Managed via `mise`.
- zsh history format includes timestamps (`: 1234567890:0;command`) — parser needs to strip those.
- Should repeated flag-value pairs be frequency-ranked in the picker? Probably yes.
- Discriminated unions: detect mutually exclusive flag groups from co-occurrence data (e.g. `-d` never with `-it`). Enrich the option space model so the TUI can grey out contradictory flags. Candidate for Task 4 enrichment.
- Exit code filtering: only include history entries that exited 0. Depends on shell — zsh `EXTENDED_HISTORY` stores duration but not exit code. Atuin does. Nice-to-have, gated on backend detection.
- **Future:** `ah` ("analyze help") — separate tool that parses `--help` / man pages to build the complete option space skeleton. `uh` provides ranking from history; `ah` provides structure from docs. They compose: `ah` skeleton + `uh` frequency = full picture.
