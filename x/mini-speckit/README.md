# mini-speckit

A **lightweight alternative** to GitHub Spec Kit for trivially small, single-doc deliverables.

## What it is

A hand-rolled "specify -> plan -> tasks -> implement -> done" lifecycle that operates on a **single markdown file** per spec. Claude uses `/mini-speckit-specify` to create specs and `/mini-speckit-next` to advance them. Codex uses a local skill registration in `AGENTS.md` to do the same work idiomatically.

It is **not** GitHub Spec Kit. It reuses speckit's lifecycle vocabulary and its tasks->implement hand-off boundary (`NEXT.md` -> a runner of your choice), but it avoids the heavier multi-file process for small work.

## When it fits

- a single-doc deliverable
- a focused tweak or low-risk improvement
- work where full speckit would be overkill

## When it does not fit

- multi-task surface contracts
- major cross-file design
- public surface, env-var, or install-path design
- work that clearly needs full speckit structure

## Install in a repo

If `mini-speckit` is available on your PATH:

```bash
mini-speckit install
```

That will:
- seed `NEXT.md` if missing
- install Claude command files into `.claude/commands/`
- register the Codex skill in `AGENTS.md`

Claude usage:
- `/mini-speckit-specify <description>` creates a new spec
- `/mini-speckit-next` advances an existing spec
- `/spec-next-mini` remains as a compatibility alias

Codex usage:
- ask Codex to use `mini-speckit` to create or advance a spec

Specs live at:
- `specs/<name>.md`

## Uninstall from a repo

```bash
mini-speckit uninstall
```

## Files

- `commands/mini-speckit-specify.md` - Claude create-spec command
- `commands/mini-speckit-next.md` - Claude advance-spec command
- `commands/spec-next-mini.md` - compatibility alias
- `codex/skills/mini-speckit/SKILL.md` - Codex skill definition
- `HANDOFF.md` - `NEXT.md` contract for runners
- `template.md` - reference template for a single-file spec
