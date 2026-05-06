# mini-speckit lifecycle

```
specify  →  plan  →  tasks  →  implement (per task)  →  done
```

## Rungs

| Rung | What lives here | What `/mini-speckit-next` does to advance |
|---|---|---|
| `specify` | Problem, Outcome, Non-goals, Success criterion, Threat-link, Constraints | Fill the Plan block. |
| `plan` | Approach, Surface, Files, Validation matrix, Compat, Lock-in, Rollback | Decompose into 3–8 tasks; fill the Tasks block. |
| `tasks` | T1..TN, each with files / success / validation / budget | Pick the first un-shipped task; implement it per its Files / Success / Validation fields, commit, log the SHA. One task per invocation. |
| `implement` | SHA log per shipped task | Once all tasks have SHAs, flip Phase to `done`. |
| `done` | Final state | No further action. |
| `blocked` | Parked on external dependency | Skipped by `/mini-speckit-next` until unblocked. |

One rung per `/mini-speckit-next` invocation. No combining `specify + plan` in one go — each rung benefits from a beat of reflection on its predecessor.

## Why these rungs

The rung names match GitHub Spec Kit deliberately. Migration goes both ways without renaming the lifecycle: outgrow → `specs/<feature>/` (speckit-native), shrink/take-over → `specs/<feature>.md` (single-file). See `mini-speckit/README.md#migration`.
