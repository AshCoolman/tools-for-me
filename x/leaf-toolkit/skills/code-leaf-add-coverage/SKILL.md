---
name: code-leaf-add-coverage
description: Apply when a leaf-partitioned repo needs test coverage raised toward a target. Picks the highest-priority leaf below target, spawns a sub-agent to write tests for its risky logic, re-runs coverage, verifies the delta, and loops. Pairs with code-leaf-link-coverage. Use when the user asks to "add coverage", "write tests for the leaves", or names a target percentage.
---

# code-leaf-add-coverage

Loop: pick the next leaf that most needs tests → agent writes tests →
verify the delta → stop when at target.

## When to invoke

- User asks to raise coverage on the leaf-partitioned codebase.
- User names a target ("get this to 80%", "p0/p1 leaves above 90%").
- After `code-leaf-link-coverage` has refreshed `LEAF.coverage.md` and
  `leaf priority` has assigned p0–p5 across leaves.

## Hard prerequisites

The skill **fails closed** if any of these are missing — surface and
stop, don't paper over:

1. `leaves.gitignored.json` exists (`yarn leaf partition`).
2. Each leaf has a `LEAF.priority[.bin-N].md` with a non-`unset`
   `priority:` field (`yarn leaf priority`).
3. Each leaf has a `LEAF.coverage[.bin-N].md` (`yarn leaf link coverage`).
4. Coverage txt files exist under `coverage-survey.gitignored/`
   (`yarn leaf survey`).

If any are absent, ask the user before running the missing tool — these
are the upstream contracts the loop reads.

## Inputs from the user

Always confirm before looping:

- **Target percentage** (e.g. 80%). Mandatory.
- **Metric** (default `all` — leaf passes only when lines, branches,
  funcs, AND stmts all hit target; alternatives `lines`, `branches`,
  `funcs`, `stmts`).
- **Priority cutoff** (default p3 — only leaves at p0..p3 get tests).
  p4/p5 leaves are explicitly excluded unless the user asks otherwise.
- **Iteration cap** (default 1 leaf — interactive verification).

Never assume; ask once, then loop.

## The loop

### Step 1 — Find candidates

```bash
yarn leaf status coverage --target <pct> --metric <metric> --below-target --json
```

Output is sorted: priority asc (p0 first), then gap-from-target desc.
Filter out leaves whose `priority` rank exceeds the user's cutoff.
**Filter strictly to `prioRank ≤ cutoff` BEFORE looking at gaps** — never
greedy-scan coverage tables for big 0% holes; the priority field is the
only correct lever.

Drop any leaf with `hint != null` (cannot be measured) and surface
those separately in the final report.

### Step 2 — Read the leaf

Read `<leafPath>/LEAF.audit[.bin-N].md` (free-form: risky logic,
important code, volatility) and `LEAF.partition[.bin-N].md` (file list,
scope) to brief the agent.

Grep the coverage txt for the leaf's basenames to see uncovered lines:

```bash
grep -E '(<basename1>|<basename2>)' <coverage-source> | \
  sed 's/\x1b\[[0-9;]*m//g'
```

### Step 3 — Spawn an agent to write tests

Use the `general-purpose` Agent (it has Write/Edit). Brief like a
colleague — include:

- Repo root and the workspace package directory.
- Exact files-under-test (from the LEAF partition doc).
- The risky-logic excerpt from `LEAF.audit.md`.
- The current coverage rows (uncovered line ranges from the grep).
- The target percentage and metric.
- The test runner the package uses (read from
  `coverage-survey.gitignored/_summary.md` — vitest or jest).
- Test conventions: collocate next to source as `<name>.test.ts(x)`,
  mirror existing patterns in the package, no mocks for behaviour the
  source already exposes purely.

**Concurrency cap.** Heavy tools (vitest, tsc) saturate RAM if many
agents run at once. Tell the agent to run vitest via `leaf safe-tool`:

```bash
yarn leaf safe-tool --cap 8 --match vitest -- vitest run --coverage ...
```

…or use the convenience verb `yarn leaf safe-vitest -- run --coverage ...`.

Tell the agent:
1. Add tests until the metric passes target for the leaf's files.
2. Run the package's test command with `--coverage` and report the new
   number for each file under test.
3. Not modify production code unless a test reveals a defensible bug
   (and if so, flag it explicitly).

### Step 4 — Re-run coverage

After the agent reports back:

```bash
cd <workspace-dir> && yarn leaf safe-vitest -- run --coverage \
  --coverage.reporter=text --coverage.reporter=text-summary --passWithNoTests
```

Capture the new summary block. (Or re-run `yarn leaf survey` for a clean
rewrite of all txt files — slower but consistent.)

### Step 5 — Refresh leaf docs

```bash
yarn leaf link coverage
```

This rewrites every leaf's `LEAF.coverage.md` with the new numbers.
Idempotent.

### Step 6 — Verify delta

Re-run:

```bash
yarn leaf status coverage --target <pct> --metric <metric> --json
```

Compare the row for the just-touched leaf:

- **At target** → mark complete. If iteration-cap reached or no
  candidates remain, stop. Otherwise return to Step 1.
- **Improved but not at target** → record the delta, decide with the
  user whether to re-spawn for another pass or move on.
- **No improvement / regression** → STOP. Surface the failure with the
  agent's report so the user can intervene.

## Per-package coverage caveat

`leaf survey` runs vitest **per workspace**, not per leaf. So when a
workspace contains many leaves they all share the same workspace-level
summary numbers. Per-leaf delta is the change in those workspace numbers
attributable to the new tests, not a leaf-isolated metric. Surface this
to the user when reporting.

If finer-grained measurement is needed, the agent can produce a leaf-
scoped vitest invocation with `--coverage.include=<glob>` matching the
leaf's files.

## Stopping conditions

Stop the loop and report when ANY of these hits:

- Target reached for all leaves at/above the priority cutoff.
- Iteration cap reached.
- A leaf failed to improve after one agent pass.
- Test suite went red (do not press on with broken tests).
- User says stop.

## What to report back

After each leaf and at the end of the loop:

```
LEAF: packages/foo/src/entity-view-lib  (p1)
  before: lines 8.8% / branches 74.3% / funcs 57.3%
  after:  lines 22.4% / branches 78.1% / funcs 63.2%
  delta:  +13.6 lines
  tests added: 4 files, 27 cases
  notes:  workspace shares coverage with 15 other leaves; per-leaf
          delta inferred from --coverage.include=… run.
```

End-of-loop summary lists every leaf touched, their before/after, and
any leaves remaining below target.

## Pairs with

- `code-leaf-link-coverage` — refreshes the `LEAF.coverage.md` doc this
  skill reads. Run it before and after each loop iteration.

## Escape hatch

- If the agent struggles with a leaf (tightly coupled code, lots of
  React + DOM, missing fixtures), record the blocker in the leaf
  `LEAF.coverage.md` under a `**Blocker:**` line and skip to the next
  leaf. User decides later whether to restructure or lower the target.
