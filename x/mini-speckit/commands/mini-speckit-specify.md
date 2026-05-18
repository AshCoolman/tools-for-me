---
description: Create a new mini-speckit single-file spec from a short description. Use for small, low-risk work where full speckit would be overkill.
---

# /mini-speckit-specify

Create a new mini-speckit spec in `specs/*/work.md` from a short user description.

## Use this for

- small, low-ceremony work
- a single-doc deliverable or focused tweak
- work where full speckit would be overkill

Do **not** use this for:
- full speckit directories under `specs/<feature>/`
- multi-file contracts, public surface design, env-var design, or clearly cross-cutting work

## Steps

1. Read the user's description.
2. Choose a concise slug for `specs/<slug>/work.md`.
3. If that slug already exists, choose a nearby safe variant instead of blocking unless ambiguity is dangerous.
4. Create `specs/<slug>/work.md` with this shape (create the directory first):

```md
# Spec: <slug>

## Status
- **Phase:** specify
- **Owner:** <name/role if known>
- **Created:** <today>
- **Last advanced:** <today> by `/mini-speckit-specify`
- **Pillar:** <optional>
- **Effort budget when ready to build:** short | medium | long

## Specify - WHAT and WHY
- **Problem:** ...
- **Outcome:** ...
- **Non-goals:** ...
- **Success criterion:** ...
- **Threat-model link:** non-coverage / DX-only   # unless the prompt clearly implies otherwise
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

5. Populate at least the title, status metadata, and `Specify` block.
6. Keep the output lightweight and readable. Preserve the user's wording where it helps.
7. Do not create `plan` or `tasks` yet unless the user explicitly asked for more than specify.

## Writing guidance

- `Problem`: what the user wants changed and why it matters
- `Outcome`: visible shipped state
- `Non-goals`: what this will not do
- `Success criterion`: 1-2 verifiable checks
- `Threat-model link`: `non-coverage / DX-only` unless the user described a real security angle
- `Constraints`: explicit must/must-not/nice-to-have points from the prompt

## Notes

- This command is intentionally cheap. Bias toward creating the spec instead of interrogating the user.
- If the request obviously outgrows mini-speckit, say so and recommend full speckit instead of forcing it.
- Never invoke or suggest `speckit-*` commands. See `SHARED.md` § Discipline. The next step after this command is `/mini-speckit-next` (or stop). Do not name `/speckit.specify`, `/mini-speckit-plan`, or any other non-mini-speckit command as a next step.
