# CLI Contract: cslice

Package: `@ashcoolman/contract-slice`
Binary: `cslice`

## Commands

### `cslice init [options]`

Installs Contract Slice workflow assets into the target directory.

**Default behaviour (no flags)**: installs commands + scripts + docs.

**Options**:

| Flag | Type | Default | Description |
|---|---|---|---|
| `--dry-run` | boolean | false | Report actions without writing files |
| `--force` | boolean | false | Overwrite existing files |
| `--target <dir>` | string | `process.cwd()` | Root directory to install into |
| `--claude-commands` | boolean | false | Install only Claude command files |
| `--skill` | boolean | false | Also install Claude skill files |
| `--scripts` | boolean | false | Install only shell scripts |
| `--all` | boolean | false | Install everything |

**Exit codes**: `0` success, `1` fatal error (e.g., `--target` does not exist).

**Output contract**:

```
CREATE .claude/commands/cslice.intent.md
SKIP   .claude/commands/cslice.contract.md
OVERWRITE scripts/cslice-verify.sh
```

Each line: `<ACTION><spaces><relative-path>`. Action is one of `CREATE`, `SKIP`, `OVERWRITE`. Path is relative to `--target`.

---

### `cslice doctor`

Checks Contract Slice installation health in the current directory (or `--target`).

**Options**:

| Flag | Type | Default | Description |
|---|---|---|---|
| `--target <dir>` | string | `process.cwd()` | Directory to inspect |

**Exit codes**: `0` if no `FAIL` items, `1` if any `FAIL` items.

**Output contract**:

```
PASS command files installed
WARN no typecheck script found
WARN no pnpm-lock.yaml found
PASS scripts/cslice-verify.sh executable
```

Each line: `<STATUS> <message>`. Status is one of `PASS`, `WARN`, `FAIL`.

**Checks performed** (in order):

1. `.claude/commands/cslice.intent.md` exists
2. `.claude/commands/cslice.contract.md` exists
3. `.claude/commands/cslice.review.md` exists
4. `.claude/commands/cslice.tests.md` exists
5. `.claude/commands/cslice.implement.md` exists
6. `.claude/commands/cslice.verify.md` exists
7. `scripts/cslice-verify.sh` exists
8. `scripts/cslice-verify.sh` is executable
9. `pnpm-lock.yaml` or `yarn.lock` or `package-lock.json` exists (package manager detected)
10. `tsconfig.json` exists
11. `package.json` has a `typecheck` script
12. `package.json` has a `test` script
13. `package.json` has a `lint` script
14. `package.json` has a `build` script

Items 7–14 are `WARN` (not `FAIL`) if absent.

---

### `cslice print <template>`

Prints a template to stdout.

**Positional argument**: `template` — one of `intent`, `contract`, `review`, `tests`, `implement`, `verify`.

**Exit codes**: `0` success, `1` unknown template name.

**Output**: The raw markdown content of the named command template, printed to stdout.

---

### `cslice --version`

Prints the package version and exits.

### `cslice --help`

Prints usage and exits.
