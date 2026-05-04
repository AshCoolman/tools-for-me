# mini-speckit hand-off contract

`/spec-next-mini` does not implement code. At the `tasks → implement` rung it appends a free-form one-line entry to `NEXT.md` at the repo root, then stops. A separate runner is responsible for picking up that entry and shipping the task.

This document defines the contract so any runner — your own custom one, a published runner suite, or even a human — can consume mini-speckit output.

## NEXT.md format

Free-form numbered list at the repo root.

```
1. <one-line title>. <spec-path or hint>. (<budget>)
2. ...
```

The trailing `(short)` / `(medium)` / `(long)` is a budget hint, not a hard tag. Runners infer scope from the entry text plus any linked spec.

`/spec-next-mini` writes entries in this shape when handing off:

```
Ship T<N> of <spec-name> — <task title>. specs/<name>.md (T<N> block). (<budget>)
```

The runner's job: find that line, fetch the matching `T<N>` block from the named spec, ship the work, remove the line, note the SHA.

## Per-task block shape (in the spec)

A mini-speckit spec's `## Tasks` block contains entries like:

```
### T1 — <title>

- **Files:** `path/to/file.sh`
- **Success:** <one verifiable assertion>
- **Validation:** <how to verify — bash -n, jq, smoke test, your repo's diff-review skill, etc.>
- **Budget:** short | medium | long
- **Depends on:** T_, T_, ...   (optional)
```

These four mandatory fields (Files / Success / Validation / Budget) are what an auto-runner needs to ship without asking questions. If any is missing, an auto-runner should refuse and surface the gap; an interactive runner should ask the human.

## Pick a runner

mini-speckit ships **no runner**. The hand-off at `tasks → implement` writes a `NEXT.md` line and stops. You choose what consumes it.

Three options, in increasing order of effort:

1. **Human.** Read `NEXT.md`, do the work, remove the line, log the SHA. Lowest setup; obviously the slowest.
2. **An off-the-shelf runner suite.** Any skill set that consumes `NEXT.md` entries with the budget hint as the size gate works here — short/medium/long runners pick up matching entries and ship them.
3. **Your own runner.** See "Writing your own runner" below.

The contract above (NEXT.md format + per-task block shape) is what any runner must speak.

## Writing your own runner

Minimum viable runner:

1. Read `NEXT.md`. Parse the first non-empty numbered line.
2. Infer budget from the trailing `(short|medium|long)` hint or from the linked spec.
3. Refuse if budget doesn't match the runner's scope; redirect.
4. Fetch the T-block from the linked spec via the path in the entry.
5. Ship the work per Files / Success / Validation. Run the validation commands.
6. Commit with conventional-commit subject + body explaining WHY.
7. Remove the line from `NEXT.md`. Note SHA in commit body or follow-up commit.
8. Append the SHA to the spec's `## Implement` log.

## Boundary

`/spec-next-mini` writes; runners ship. Never bridge them silently — the boundary is the durable record (NEXT.md + spec doc + git history). If a runner authors content into a spec, or `/spec-next-mini` ships code, you've recreated the original "competing process" bug that motivated extracting mini-speckit in the first place.
