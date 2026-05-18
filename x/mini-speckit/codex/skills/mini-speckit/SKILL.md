---
name: mini-speckit
description: Use when the user wants to create, advance, or manage a mini-speckit single-file spec in `specs/*/work.md`, mentions `mini-speckit`, `/mini-speckit-specify`, `/mini-speckit-next`, or `/spec-next-mini`, or wants a lightweight alternative to full speckit for small work.
---

# mini-speckit

This skill is the Codex-native equivalent of the Claude mini-speckit commands.

## When to use it

Use this skill when the user:
- wants to create a mini-speckit spec from a short description
- wants to work on a mini-speckit spec in `specs/*/work.md`
- mentions `mini-speckit`, `/mini-speckit-specify`, `/mini-speckit-next`, or `/spec-next-mini`
- wants to advance a single-file mini-speckit spec one rung
- wants the next mini-speckit task implemented
- wants the lightweight path rather than full speckit

Do not use this skill for full speckit directories under `specs/<feature>/`; those belong to the normal speckit flow.

## Workflow

### Creating a spec

1. Read the user request.
2. Choose a concise slug for `specs/<slug>/work.md`.
3. Create `specs/<slug>/work.md` (create the directory first).
4. Populate title, status metadata, and the `Specify` block.
5. Keep it cheap and readable.
6. Do not create `plan` or `tasks` unless the user asked for more than specify.

### Advancing a spec

1. Check `NEXT.md` first.
2. Otherwise inventory only `specs/*/work.md`.
3. Ignore `specs/<feature>/` dirs that don't contain `work.md` — those are full speckit.
4. Apply hard demotions for blocked or outside-team dependencies.
5. Rank candidates with the same score table as `/mini-speckit-next`.
6. Advance exactly one rung.
7. Validate the result.
8. Commit with conventional commits using scope `mini-spec` if the user wants commits.

## Rung boundaries

- `specify -> plan`: fill the `## Plan` block inline.
- `plan -> tasks`: decompose into 3-8 tasks with files, success, validation, and budget.
- `tasks -> implement`: pick the first unshipped task. Implement it per its Files / Success / Validation fields. Run validation. Commit with conventional-commit scope `mini-spec`. Log the SHA in `## Implement`. One task per invocation.
- `implement -> done`: only when every task has a SHA in `## Implement`.

## Hard rules

- Never silently bridge mini-speckit into the full speckit workflow.
- Never operate on multi-file speckit directories with this skill.
- Never invoke or suggest `speckit-*` commands. The only valid next step from a mini-speckit command is another mini-speckit command (`/mini-speckit-specify`, `/mini-speckit-next`) or stop. See `SHARED.md` § Discipline.
