# CLI Contract — `leaf partition` (extended)

The partition-stability fix touches the CLI surface in two places, both additive: a new flag on `leaf partition`, and an updated on-disk filename suffix for per-bin docs. No verbs added or removed.

## `leaf partition` (existing — minor extension)

### New flag

| Flag | Type | Default | Notes |
|---|---|---|---|
| `--migrate-bin-labels` | bool | `false` | Short-circuits the normal partition pipeline. Re-partitions, scans existing `LEAF.<domain>.bin-*.md` files, renames each to its new content-derived suffix, and prints a `MigrationReport`. Idempotent. |
| `--json` | bool | `false` | Used in conjunction with `--migrate-bin-labels`: emits the `MigrationReport` as JSON instead of human-readable. (Otherwise unchanged for the normal partition flow.) |

### Behaviour matrix

| Invocation | Effect |
|---|---|
| `leaf partition` | unchanged from spec 001. Walks workspaces, runs `partitionTree`, writes `leaves.gitignored.json` with new `binId` field per bin leaf, regenerates `LEAF.partition.bin-<id>.md` (and creates `LEAF.audit.bin-<id>.md` if missing). |
| `leaf partition --migrate-bin-labels` | runs the partition algorithm, then renames any pre-existing `LEAF.<domain>.bin-*.md` files (priority + audit) to the new `bin-<id>.md` form. Prints summary. |
| `leaf partition --migrate-bin-labels --json` | same as above; output is `MigrationReport` JSON to stdout. |

### Stdout — `--migrate-bin-labels` human form

```
Migrating bin labels in /Users/me/repo …
Re-partitioning before rename…
Found 14 LEAF.*.bin-*.md files across 5 directories.

Renamed (12):
  src/foo/LEAF.priority.bin-1.md             → LEAF.priority.bin-3a7f2c.md
  src/foo/LEAF.priority.bin-2.md             → LEAF.priority.bin-9d4e0b.md
  src/foo/LEAF.audit.bin-1.md                → LEAF.audit.bin-3a7f2c.md
  …
Unchanged (1):
  src/baz/LEAF.priority.bin-7c1a48.md        (already migrated)
Orphaned (1):
  src/quux/LEAF.priority.bin-3.md            (no matching bin in new partition — leaf shape changed)

Wrote 14 leaves to leaves.gitignored.json (updated).
```

### Stdout — `--migrate-bin-labels --json` form

```json
{
  "renamed": [
    { "oldName": "LEAF.priority.bin-1.md", "newName": "LEAF.priority.bin-3a7f2c.md", "leafPath": "src/foo", "domain": "priority" }
  ],
  "unchanged": [
    { "name": "LEAF.priority.bin-7c1a48.md", "leafPath": "src/baz", "reason": "already migrated" }
  ],
  "orphaned": [
    { "name": "LEAF.priority.bin-3.md", "leafPath": "src/quux", "reason": "no matching bin in new partition" }
  ]
}
```

### Exit code

- `0` when migration completed (orphans are *not* an error condition; they are reported, not failed).
- `1` when the migration could not run (FS errors, no `partitionRoots`, ambiguous match without manifest).

### Idempotency

Running `leaf partition --migrate-bin-labels` twice in a row over a clean tree:

- First run: `renamed.length > 0` for any pre-existing legacy filenames; `orphaned.length` reflects truly orphaned bins.
- Second run: `renamed.length === 0`. All previously-renamed files are now in `bin-<hash>` form whose hash matches the current partition; they appear in `unchanged` with reason `"same hash"`.

## On-disk filename suffix change

| Before | After |
|---|---|
| `LEAF.priority.bin-1.md` | `LEAF.priority.bin-3a7f2c.md` |
| `LEAF.partition.bin-2.md` | `LEAF.partition.bin-9d4e0b.md` |
| `LEAF.audit.bin-1.md` | `LEAF.audit.bin-3a7f2c.md` |
| `LEAF.priority.md` (no suffix) | unchanged when `scope === "subtree"` |

The frontmatter inside these files still includes `binIndex: N` and `binTotal: M` for human readability; it gains `binId: <hash>` as the load-bearing key.

## Determinism contract

For any fixed `(repoBase, source-tree state, prior LEAF.*.bin-*.md state)`, two consecutive `leaf partition` runs (without `--migrate-bin-labels`) produce:

- Byte-identical `leaves.gitignored.json` *except* for the `generatedAt` timestamp envelope field.
- Byte-identical `LEAF.partition.bin-<id>.md` filenames and contents per leaf.
- A second run touches no `LEAF.audit.bin-*.md` (existence-guarded).

For `leaf partition --migrate-bin-labels`, see "Idempotency" above.

## `leaf sim` contract changes

The `leaf sim` CLI from spec 001 is unchanged. Internally, its drift detector now uses `binId` for cross-run identity (per the data-model update); its public surface is unchanged. `sim report --json` emits `binId` per bin leaf in the `leaves[]` array.

## Out of scope for this CLI extension

- No new verbs.
- No `partition --dry-run` for migration. Reading the printed report and inspecting the workspace is sufficient; the rename is reversible by hand if needed.
- No automatic `git mv` integration — `fs.renameSync` is enough; users commit the renames separately.
- No `LEAF.<domain>.md` body content changes.
