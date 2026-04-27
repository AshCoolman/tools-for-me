# Leaf rules

Three rules the toolkit treats as load-bearing. Break them and the value of the workflow erodes.

## 1. Priority gate is non-negotiable

When running `leaf status` to pick the next leaf for a coverage / refactor / security loop:

```bash
leaf status <domain> --target <pct> --metric <metric> --below-target --json
```

…filter the rows to `prioRank ≤ cutoff` **before** looking at gaps. Never pick a leaf because its coverage table has a big 0% hole — the priority field exists exactly to prevent that.

If no measurable p0–p3 leaf remains below target, **stop and report**. Don't reach down to p4/p5 to find more work.

## 2. Priority dictates scope, not the other way round

The `LEAF.priority.md` field is the source of truth for "is this code in scope for X?" — coverage thresholds, refactor cycles, security reviews. They all derive their candidate list from priority.

**Anti-pattern:** "the workspace says 65% but most uncovered code is in `command-advance-sim` — let's add it to `coverage.exclude`." That lets ephemeral opinion about a coverage number override the durable priority decision.

**Correct flow:** if a coverage % feels wrong, audit the priority field, not the coverage scope. `leaf scope-from-priority` regenerates the exclude list from priority — never hand-edit a tool's exclude list to make a metric look better.

## 3. Concurrency cap is global, not per-invocation

Heavy tools (`vitest`, `tsc`, `playwright`) saturate RAM if many parallel agents each spawn their own pool. The vitest config setting `poolOptions.forks.maxForks` is **per invocation only** — it does not coordinate across processes.

To cap total system load, run heavy tools through `leaf safe-tool` (or the convenience preset `leaf safe-vitest`):

```bash
leaf safe-tool --cap 8 --match vitest -- vitest run --coverage ...
```

Two backends ship:

- **pgrep poll** (default, portable): polls `pgrep -af <pattern>` every N seconds.
- **flock semaphore** (`--flock-dir <path>`, requires `util-linux` flock): N file locks act as a counted semaphore — no busy-poll.

When dispatching multiple agents that each run vitest, prefer **serial dispatch** (one Agent call per message). Each parallel invocation spawns its own pool, multiplying RAM use.
