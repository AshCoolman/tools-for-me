---
description: Advance an existing mini-speckit single-file spec one rung at a time. Use for small, low-ceremony work; not for full speckit directories.
---

# /mini-speckit-next

Advance an existing mini-speckit spec one rung at a time.

## Scope

`/mini-speckit-next` only operates on:
- single-file specs at `specs/<name>.md`

It does **not** operate on:
- speckit-native specs under `specs/<feature>/`
- `idea-files/*.md` or `IDEAS.md`

If no mini-speckit-format specs exist in the repo, stop with: `No mini-speckit specs found at specs/*.md. To start one, run /mini-speckit-specify <description>.`

## Inventory and ranking

1. Check `NEXT.md` first.
   - If the top item clearly points at a mini-speckit spec or task, honor it before scoring.
2. Otherwise inventory `specs/*.md` only.
3. Parse `## Status` `Phase:`.
4. Apply hard demotions before scoring:
   - blocked on outside-team dependency
   - still waiting on vendor/legal/regulatory reality
   - next rung cannot be completed with information available in this session
5. Score candidates:
   - `tasks`, >= 1 task ready, none shipped -> 0.6
   - `tasks`, N/M shipped -> 0.6 + 0.2 × (N/M)
   - `plan` -> 0.4
   - `specify` -> 0.2
   - `done` or `blocked` -> skip
6. Tie-breakers:
   - security pillar first
   - smaller delta to next rung
   - newer creation date

## Advance exactly one rung

`specify -> plan`
- Fill `## Plan - HOW` with approach, surface, files, validation, backward-compat, lock-in, rollback.

`plan -> tasks`
- Decompose into 3-8 tasks.
- Each task should include files, success, validation, and budget.

`tasks -> implement`
- Pick the first unshipped task.
- Implement it per its Files / Success / Validation fields.
- Run the validation commands and confirm they pass.
- Commit with conventional-commit scope `mini-spec`.
- Log the SHA in `## Implement`.

`implement -> done`
- Only when every task has a SHA in `## Implement`.

## Validation

- Markdown still reads cleanly.
- The edited spec still has a coherent rung.
- If you implemented a task, run its Validation commands and confirm they pass before committing.

## Commit discipline

- Conventional Commits
- scope `mini-spec`
- body explains why this rung moved now

## Notes

- This command is intentionally lightweight and low-ceremony.
- Never invoke `speckit-*` skills from this command.
- One rung per invocation. When implementing, one task per invocation.
