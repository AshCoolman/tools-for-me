# Leaf workflow

The full pipeline. Each step is one CLI verb; no script chaining required.

## Pipeline

1. **`leaf partition`** — walks the repo, groups source files into folder-aligned ~1000-LOC leaves (bin-packed when oversize), writes `leaves.gitignored.json` + per-leaf `LEAF.partition[.bin-N].md` + `LEAF.audit[.bin-N].md` (audit only if missing — preserves sub-agent populated content).
2. **Sub-agent populates `LEAF.audit.md`** with risky logic / important code / volatility (last 7 days). Free-form. Drives prompts for downstream loops.
3. **`leaf priority [--distribute]`** — interactive TUI assigns p0–p5 to each leaf, writing the chosen level to `LEAF.priority[.bin-N].md` frontmatter. `--distribute` shows histogram vs suggested target curve (p0:5% p1:8% p2:17% p3:25% p4:30% p5:15%) and walks reclassification.
4. **`leaf survey [--only=<substr>]`** — runs each workspace's `vitest`/`jest` with text + text-summary coverage reporters → `coverage-survey.gitignored/<pkg>.txt` + `_summary.md`.
5. **`leaf link coverage [--dry-run]`** — writes `LEAF.coverage[.bin-N].md` per leaf, embedding the parsed summary block + link to the per-package coverage txt. Idempotent.
6. **`leaf status coverage --target <pct> --metric all|lines|branches|funcs|stmts [--below-target] [--json]`** — sorted candidate list (p0 first, gap-from-target desc). Skill loops consume the JSON.
7. **`leaf scope-from-priority`** — emits `leaf-coverage-scope.gitignored.json` listing files in `low`/`lowest` priority leaves. Downstream test/lint/sonar configs read it to derive `coverage.exclude`.

## Skills (Claude Code)

Bundled under `skills/` in this package. To use, copy each skill dir into your `~/.claude/skills/` (or via a future Layer-2 plugin).

- **`code-leaf-link-coverage`** — wraps step 5. Run after `leaf survey` or new audit content.
- **`code-leaf-add-coverage`** — drives step 6 → spawn agent to write tests → re-run coverage → re-link → verify delta. Asks user for target / metric / priority cutoff / iteration cap. Picks ONLY from leaves at or above the cutoff (priority gate is non-negotiable).

## Per-package coverage caveat

`leaf survey` runs vitest per workspace, not per leaf. Many leaves in one workspace share the same summary numbers. For per-leaf isolation use `--coverage.include=<glob>` matching the leaf's files (passed to the test runner directly).

## Doc shapes

Every `LEAF.<domain>[.bin-N].md` has YAML frontmatter (machine contract) plus a markdown body (humans + LLMs).

- **`LEAF.priority.md`** — `priority: <p0..p5>` field. Durable. Edited by `leaf priority` (or by hand).
- **`LEAF.partition.md`** — `scope`, `loc`, `fileCount`, `binIndex`. Files list. Regenerated each `leaf partition`.
- **`LEAF.coverage.md`** — `pkg`. Source link, summary line. Regenerated each `leaf link coverage`.
- **`LEAF.audit.md`** — risky logic + important code + volatility. Free-form. Sub-agent owned.
- **`LEAF.<your-domain>.md`** — register a custom plugin and ship more.

Bin-scoped leaves disambiguate by index in the filename suffix.

## .gitignore

The toolkit produces these gitignored artefacts at repo root:

- `leaves.gitignored.json` — the manifest
- `leaf-coverage-scope.gitignored.json` — generated exclude list
- `coverage-survey.gitignored/` — per-package coverage txts

The `*.gitignored*` glob already covers all of them. LEAF docs themselves: `LEAF.priority.md` is durable (commit it). `LEAF.partition.md`, `LEAF.coverage.md`, `LEAF.audit.md` are generated — gitignore is fine.
