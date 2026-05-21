# Implementation Plan: Contract Slice CLI Package

**Branch**: `001-cslice-cli-package` | **Date**: 2026-05-21 | **Spec**: [spec.md](./spec.md)

## Summary

Build `@ashcoolman/contract-slice` — a small TypeScript CLI (`cslice`) that installs Claude command templates, optional skill files, a shell gate script, and doc templates into any target project. The implementation uses `commander` + `kleur`, embeds templates as shipped files, and is distributed via npm/pnpm as a runnable package (`pnpm dlx`).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 18+

**Primary Dependencies**: `commander ^12`, `kleur ^4` (runtime); `typescript ^5`, `vitest ^2`, `tsx ^4`, `@types/node ^20` (dev)

**Storage**: N/A — file templates shipped as package assets under `src/templates/`

**Testing**: Vitest

**Target Platform**: Node.js CLI, cross-platform (macOS/Linux primary; Windows not blocked)

**Project Type**: CLI package (npx/pnpm-dlx-distributable)

**Performance Goals**: Cold init command under 2 seconds

**Constraints**: No postinstall scripts; no network calls at runtime; no template engines; no inquirer/chalk/execa/fs-extra; pnpm workspace compatible

**Scale/Scope**: ~6 command templates, ~7 skill files, ~4 doc templates, 1 shell script

## Constitution Check

*The project constitution is an unfilled placeholder template. No active principles to gate against. Proceeding without constitution gates.*

## Project Structure

### Documentation (this feature)

```text
specs/main/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── cli.md           # CLI interface contract
└── tasks.md             # Phase 2 output (from /speckit-tasks)
```

### Source Code

```text
x/contract-slice/
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── cli.ts                      # Entry point, commander program
│   ├── commands/
│   │   ├── init.ts                 # cslice init
│   │   ├── doctor.ts               # cslice doctor
│   │   └── print.ts                # cslice print
│   ├── templates/
│   │   ├── claude/
│   │   │   └── commands/
│   │   │       ├── cslice.intent.md
│   │   │       ├── cslice.contract.md
│   │   │       ├── cslice.review.md
│   │   │       ├── cslice.tests.md
│   │   │       ├── cslice.implement.md
│   │   │       └── cslice.verify.md
│   │   ├── skills/
│   │   │   └── contract-slice/
│   │   │       ├── SKILL.md
│   │   │       └── references/
│   │   │           ├── theory.md
│   │   │           ├── typescript-contracts.md
│   │   │           ├── runtime-schemas.md
│   │   │           ├── property-tests.md
│   │   │           ├── failure-modes.md
│   │   │           └── hard-gates.md
│   │   ├── docs/
│   │   │   ├── contract-slice.md
│   │   │   ├── theory.md
│   │   │   ├── intent-template.md
│   │   │   └── contract-template.md
│   │   └── scripts/
│   │       └── cslice-verify.sh
│   └── utils/
│       ├── copy-template.ts        # Core file-copy with CREATE/SKIP/OVERWRITE logic
│       ├── detect-project.ts       # Detect package manager, tsconfig presence, scripts
│       └── fs.ts                   # fs helpers (mkdirp, exists, chmod)
├── test/
│   ├── init.test.ts
│   ├── doctor.test.ts
│   └── fixtures/
│       └── empty-repo/
└── dist/                           # tsc output (gitignored)
```

**Structure Decision**: Single package under `x/contract-slice`, picked up by the `x/*` pnpm workspace glob. TypeScript source compiles to `dist/`. CLI entry is declared in `package.json#bin`.
