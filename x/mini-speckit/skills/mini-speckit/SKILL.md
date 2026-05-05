---
name: mini-speckit
description: Use when the user wants to create, advance, or manage a mini-speckit single-file spec in `specs/*.md`, mentions `mini-speckit`, or wants a lightweight alternative to full speckit for small work.
---

# mini-speckit

This skill is the host-neutral mini-speckit workflow.

Use it when the user:
- wants to create a mini-speckit spec from a short description
- wants to work on a mini-speckit spec in `specs/*.md`
- mentions `mini-speckit`
- wants to advance a single-file mini-speckit spec one rung
- wants the next mini-speckit task queued into `NEXT.md`
- wants the lightweight path rather than full speckit

Do not use this skill for full speckit directories under `specs/<feature>/`; those belong to the normal speckit flow.

## Native entrypoints

Some hosts also expose explicit commands for this workflow:
- Claude: `/mini-speckit-specify`, `/mini-speckit-next`, `/spec-next-mini` (compatibility alias)
- Gemini: `/mini-speckit:specify`, `/mini-speckit:next`

## Workflow

### Creating a spec

1. Read the user request.
2. Choose a concise slug for `specs/<slug>.md`.
3. If the slug already exists, choose a nearby safe variant unless ambiguity is dangerous.
4. Create `specs/<slug>.md`.
5. Populate title, status metadata, and the `Specify` block.
6. Keep it cheap and readable.
7. Do not create `Plan` or `Tasks` unless the user asked for more than specify.

Use this shape:

```md
# Spec: <slug>

## Status
- **Phase:** specify
- **Owner:** <name/role if known>
- **Created:** <today>
- **Last advanced:** <today> by `mini-speckit`
- **Pillar:** <optional>
- **Effort budget when ready to build:** short | medium | long

## Specify - WHAT and WHY
- **Problem:** ...
- **Outcome:** ...
- **Non-goals:** ...
- **Success criterion:** ...
- **Threat-model link:** non-coverage / DX-only
- **Constraints:** ...

## Plan - HOW
_(pending)_

## Tasks
_(pending)_

## Implement
_(pending)_

## Notes / open questions
- _(none)_
```

### Advancing a spec

1. Check `NEXT.md` first.
   - If the top item clearly points at a mini-speckit spec or task, honor it before scoring.
2. Otherwise inventory only top-level `specs/*.md`.
3. Ignore `specs/<feature>/` full speckit directories.
4. Parse `## Status` and the `Phase:` value.
5. Apply hard demotions before scoring:
   - blocked on outside-team dependency
   - still waiting on vendor, legal, or regulatory reality
   - next rung cannot be completed with information available in this session
6. Score candidates:
   - `tasks`, >= 1 task ready, none shipped -> 0.6
   - `tasks`, N/M shipped -> 0.6 + 0.2 x (N/M)
   - `plan` -> 0.4
   - `specify` -> 0.2
   - `done` or `blocked` -> skip
7. Tie-breakers:
   - security pillar first
   - smaller delta to next rung
   - newer creation date
8. Advance exactly one rung.
9. Validate the result.

## Rung boundaries

- `specify -> plan`: fill the `## Plan - HOW` block inline with approach, surface, files, validation, backward-compat, lock-in, and rollback.
- `plan -> tasks`: decompose into 3-8 tasks with files, success, validation, and budget.
- `tasks -> implement`: append one nomination line to `NEXT.md`. Do not implement code.
- `implement -> done`: only when every task has a SHA in `## Implement`.

## Validation

- Markdown still reads cleanly.
- The edited spec still has a coherent rung.
- If you appended to `NEXT.md`, re-read it and confirm the line resolves to a budget and a spec path.

## Hard rules

- Never implement product code as part of this skill.
- Never silently bridge mini-speckit into the full speckit workflow.
- Never operate on multi-file speckit directories with this skill.
- Keep edits inside the single mini-speckit spec plus `NEXT.md` when needed.
