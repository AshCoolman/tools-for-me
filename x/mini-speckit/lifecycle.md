# mini-speckit lifecycle

```
specify  →  plan  →  tasks  →  implement (per task)  →  done
                                       │
                                       └─── handoff via NEXT.md → your runner (see HANDOFF.md)
```

## Rungs

| Rung | What lives here | What `/mini-speckit-next` does to advance |
|---|---|---|
| `specify` | Problem, Outcome, Non-goals, Success criterion, Threat-link, Constraints | Fill the Plan block. |
| `plan` | Approach, Surface, Files, Validation matrix, Compat, Lock-in, Rollback | Decompose into 3–8 tasks; fill the Tasks block. |
| `tasks` | T1..TN, each with files / success / validation / budget | Pick the first un-shipped task; append a free-form line to `NEXT.md` for your configured runner to ship. Do **not** implement. |
| `implement` | SHA log per shipped task | Once all tasks have SHAs, flip Phase to `done`. |
| `done` | Final state | No further action. |
| `blocked` | Parked on external dependency | Skipped by `/mini-speckit-next` until unblocked. |

One rung per `/mini-speckit-next` invocation. No combining `specify + plan` in one go — each rung benefits from a beat of reflection on its predecessor.

## Hand-off boundary

`/mini-speckit-next` never implements code. The boundary is at `tasks → implement`: the command writes a one-line nomination to `NEXT.md` (free-form, e.g. `Ship T2 of <spec> — <one-line title>. <spec-path>. (short)`). A runner you configure (see `HANDOFF.md`) reads `NEXT.md`, fetches the task block from the spec, ships it, removes the line from `NEXT.md`, and notes the SHA in the spec's Implement log.

## Why these rungs

The rung names match GitHub Spec Kit deliberately. Migration goes both ways without renaming the lifecycle: outgrow → `specs/<feature>/` (speckit-native), shrink/take-over → `specs/<feature>.md` (single-file). See `mini-speckit/README.md#migration`.
