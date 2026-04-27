---
name: code-leaf-link-coverage
description: Apply when a repo with leaf priority docs (LEAF.priority.md, produced by `leaf priority`) needs each leaf updated with a coverage status doc (LEAF.coverage.md). Use after running coverage, when adding new leaves, or before kicking off a coverage-improvement loop. Idempotent — re-runnable as coverage drifts. Pairs with code-leaf-add-coverage.
---

# code-leaf-link-coverage

Refresh `LEAF.coverage[.bin-N].md` for every leaf, linking it to the
per-package coverage txt and embedding the parsed `text-summary` block.
Coverage drifts; LEAF docs stay terse and re-runnable.

## When to invoke

- Right after `yarn leaf survey` completes.
- After `yarn leaf partition` adds/removes leaves.
- Before starting a coverage-improvement loop (so the loop reads current
  numbers from each `LEAF.coverage.md`).
- Periodically — coverage txt regenerates, summary numbers move, link
  refresh keeps each leaf informative without embedding stale data.

## Prerequisites

- `leaves.gitignored.json` exists at repo root (`yarn leaf partition`).
- `coverage-survey.gitignored/*.txt` exists (`yarn leaf survey`).

If any of those are missing the command fails with a named `FAIL:` line.

## How to invoke

Always preview first:

```bash
yarn leaf link coverage --dry-run
```

Then write:

```bash
yarn leaf link coverage
```

The verb:

1. Reads `leaves.gitignored.json`.
2. Resolves each leaf to its owning workspace (longest-prefix match
   against root `package.json` `workspaces`).
3. Maps the workspace package name to its coverage txt:
   - `@scope/name` → `coverage-survey.gitignored/_scope_name.txt`
   - `unscoped-name` → `coverage-survey.gitignored/unscoped-name.txt`
4. Parses the trailing `Coverage summary` block (statements / branches /
   functions / lines) — ANSI-stripped.
5. Writes a fresh `LEAF.coverage[.bin-N].md` per leaf (frontmatter +
   heading + summary line). Idempotent.
6. Prints a `PASS:` / `SKIP:` / `DRY:` line per leaf and a final
   `DONE: <n> updated …` summary.

## Doc shape

Each leaf gets a standalone file:

```markdown
---
domain: coverage
leafPath: packages/foo/src/entity-view-lib
pkg: "@scope/foo"
---

# Coverage — `packages/foo/src/entity-view-lib/LEAF.coverage.md`

- **Source**: `coverage-survey.gitignored/_scope_foo.txt` (regenerate via `leaf survey`)
- **Package**: `@scope/foo`
- **Summary**: lines 93.96% / branches 96.71% / funcs 98.21% / stmts 93.96%
```

If a leaf cannot be linked (no workspace match, missing coverage file,
runner skipped) the doc still renders — with a `**Note:**` line
explaining why. Surface, don't hide.

## Why links, not embeds

Coverage files are large and re-generate frequently. Embedding per-leaf
file lists would (a) blow up doc size and (b) go stale after every test
run. Linking + summary stats keep docs small while still giving a
token-efficient grep target:

```bash
grep -E '(useExpandNode|fetchEntityGraph)' \
  coverage-survey.gitignored/_scope_foo.txt | \
  sed 's/\x1b\[[0-9;]*m//g'
```

## Pairs with

- `code-leaf-add-coverage` — picks the highest-priority leaf below
  target coverage, spawns an agent to write tests, re-runs coverage,
  verifies the delta. Reads what this skill writes.

## Escape hatch

- If the workspace resolver maps a leaf to the wrong package, edit
  `src/commands/link.ts:workspaceForLeaf` in the toolkit. Don't paper
  over with manual `LEAF.coverage.md` edits — they get clobbered on
  next run.
