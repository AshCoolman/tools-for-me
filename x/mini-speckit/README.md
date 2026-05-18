# mini-speckit

A lightweight alternative to full speckit for trivially small, single-doc
deliverables.

## What it is

`mini-speckit` is a `specify -> plan -> tasks -> implement -> done` lifecycle
that operates on a single Markdown file per spec.

It reuses speckit's lifecycle vocabulary but avoids the heavier multi-file
process for small work. `/mini-speckit-next` advances specs one rung at a time,
including implementing tasks directly.

## When it fits

- a single-doc deliverable
- a focused tweak or low-risk improvement
- work where full speckit would be overkill

## When it does not fit

- multi-file contracts or public surface design
- major cross-file design
- env-var or install-path design
- work that clearly needs full speckit structure

## Install in a repo

If `mini-speckit` is available on your PATH:

```bash
mini-speckit install
```

That will:

- seed `NEXT.md` if missing
- install Claude commands into `.claude/commands/`
- install the shared mini-speckit skill into `.codex/skills/mini-speckit/`
- install Gemini commands into `.gemini/commands/mini-speckit/`
- install the shared mini-speckit skill into `.gemini/skills/mini-speckit/`
- remove legacy `AGENTS.md` and `GEMINI.md` registration blocks from older installs

## Usage

Claude:

- `/mini-speckit-specify <description>` creates a new spec
- `/mini-speckit-next` advances an existing spec
- `/spec-next-mini` remains as a compatibility alias

Codex:

- use the installed `mini-speckit` project skill

Gemini:

- `/mini-speckit:specify <description>` creates a new spec
- `/mini-speckit:next` advances an existing spec
- the installed `mini-speckit` project skill can also route naturally

Specs live at:

- `specs/<name>/work.md`

## Uninstall from a repo

```bash
mini-speckit uninstall
```

## Installed surfaces

- `.claude/commands/mini-speckit-specify.md`
- `.claude/commands/mini-speckit-next.md`
- `.claude/commands/spec-next-mini.md`
- `.codex/skills/mini-speckit/SKILL.md`
- `.gemini/commands/mini-speckit/specify.toml`
- `.gemini/commands/mini-speckit/next.toml`
- `.gemini/skills/mini-speckit/SKILL.md`
- `template.md`
