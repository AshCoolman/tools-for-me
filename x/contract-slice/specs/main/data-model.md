# Data Model: Contract Slice CLI Package

There is no persistent data store. The data model describes the in-memory structures and file-system entities the CLI operates on.

## Entities

### TemplateEntry

Describes a single template file to be installed.

```ts
interface TemplateEntry {
  /** Path to source file relative to the templates root (src/templates/) */
  sourcePath: string;
  /** Path where the file will be written relative to the target directory */
  targetPath: string;
  /** Whether to chmod +x after writing */
  executable?: boolean;
}
```

### TemplateSet

A named group of TemplateEntries installed as a unit.

```ts
type TemplateSetName = 'commands' | 'skill' | 'scripts' | 'docs';

interface TemplateSet {
  name: TemplateSetName;
  entries: TemplateEntry[];
}
```

### InitOptions

Options parsed from the `cslice init` command.

```ts
interface InitOptions {
  dryRun: boolean;
  force: boolean;
  target: string;       // absolute path; defaults to process.cwd()
  claudeCommands: boolean;
  skill: boolean;
  scripts: boolean;
  docs: boolean;
  all: boolean;
}
```

**Derived rule**: If all flags are false and `all` is false, install `commands + scripts + docs` (the default set).

### FileAction

The outcome for a single file during `init`.

```ts
type FileAction = 'CREATE' | 'SKIP' | 'OVERWRITE';

interface FileResult {
  action: FileAction;
  path: string;         // display path relative to target
}
```

### DoctorItem

A single check performed by `cslice doctor`.

```ts
type DoctorStatus = 'PASS' | 'WARN' | 'FAIL';

interface DoctorItem {
  status: DoctorStatus;
  label: string;        // human-readable check description
}
```

## State transitions

```
init:
  file exists + no --force  → SKIP
  file exists + --force     → OVERWRITE (unless --dry-run)
  file absent               → CREATE (unless --dry-run)

dry-run override:
  any action                → report only, no disk write
```

## Template manifest (static)

The six Claude command files:

| Source path | Target path |
|---|---|
| `claude/commands/cslice.intent.md` | `.claude/commands/cslice.intent.md` |
| `claude/commands/cslice.contract.md` | `.claude/commands/cslice.contract.md` |
| `claude/commands/cslice.review.md` | `.claude/commands/cslice.review.md` |
| `claude/commands/cslice.tests.md` | `.claude/commands/cslice.tests.md` |
| `claude/commands/cslice.implement.md` | `.claude/commands/cslice.implement.md` |
| `claude/commands/cslice.verify.md` | `.claude/commands/cslice.verify.md` |

Skill files (installed with `--skill`):

| Source path | Target path |
|---|---|
| `skills/contract-slice/SKILL.md` | `.claude/skills/contract-slice/SKILL.md` |
| `skills/contract-slice/references/theory.md` | `.claude/skills/contract-slice/references/theory.md` |
| `skills/contract-slice/references/typescript-contracts.md` | `.claude/skills/contract-slice/references/typescript-contracts.md` |
| `skills/contract-slice/references/runtime-schemas.md` | `.claude/skills/contract-slice/references/runtime-schemas.md` |
| `skills/contract-slice/references/property-tests.md` | `.claude/skills/contract-slice/references/property-tests.md` |
| `skills/contract-slice/references/failure-modes.md` | `.claude/skills/contract-slice/references/failure-modes.md` |
| `skills/contract-slice/references/hard-gates.md` | `.claude/skills/contract-slice/references/hard-gates.md` |

Shell script (installed by default):

| Source path | Target path | Executable |
|---|---|---|
| `scripts/cslice-verify.sh` | `scripts/cslice-verify.sh` | yes |

Doc templates (installed by default):

| Source path | Target path |
|---|---|
| `docs/contract-slice.md` | `.dev/contract-slice/contract-slice.md` |
| `docs/theory.md` | `.dev/contract-slice/theory.md` |
| `docs/intent-template.md` | `.dev/contract-slice/intent-template.md` |
| `docs/contract-template.md` | `.dev/contract-slice/contract-template.md` |
