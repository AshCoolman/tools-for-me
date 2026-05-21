# Tasks: Contract Slice CLI Package

**Input**: `specs/main/`

**Feature Branch**: `001-cslice-cli-package`

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **CLI Contract**: [contracts/cli.md](contracts/cli.md) | **Data Model**: [data-model.md](data-model.md)

**Tests included**: Yes — SC-007 requires passing tests; plan.md names `test/init.test.ts` and `test/doctor.test.ts` in the project structure.

**Organization**: Tasks are grouped by user story. US1 must be complete before US2 (US2 extends `init.ts`). US3 and US4 are independent of each other and of US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared state)
- **[Story]**: Which user story (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap the package so TypeScript compilation and testing can run.

- [X] T001 Create `package.json` — name `@ashcoolman/contract-slice`, version `0.1.0`, bin `cslice → dist/cli.js`, files `["dist","src/templates"]`, scripts `build/test/typecheck/lint/gate`, runtime deps `commander@^12 kleur@^4`, devDeps `typescript@^5 vitest@^2 tsx@^4 @types/node@^20`, author `Ash Coolman <banquet.poll-4g@icloud.com>`, license MIT
- [X] T002 Create `tsconfig.json` — `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2022`, `outDir: dist`, `rootDir: src`, `strict: true`, `declaration: true`
- [X] T003 [P] Create `vitest.config.ts` — `test.include: ["test/**/*.test.ts"]`, `test.environment: "node"`
- [X] T004 Create `test/fixtures/empty-repo/.gitkeep` — empty placeholder so the fixtures directory is tracked

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities all commands depend on. Must be complete before any command implementation.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [X] T005 Implement `src/utils/fs.ts` — export `mkdirp(dir: string): Promise<void>`, `fileExists(path: string): Promise<boolean>`, `chmodX(path: string): Promise<void>` using `node:fs/promises`
- [X] T006 Implement `src/utils/copy-template.ts` — export `copyTemplate(entries: TemplateEntry[], opts: {templatesRoot: string, target: string, dryRun: boolean, force: boolean}): Promise<FileResult[]>`; implement CREATE/SKIP/OVERWRITE state transitions per data-model.md; use `mkdirp`/`fileExists`/`chmodX` from fs.ts
- [X] T007 [P] Implement `src/utils/detect-project.ts` — export `detectPackageManager(dir: string): Promise<'pnpm'|'yarn'|'npm'|null>` (checks for lockfiles) and `hasScript(pkgPath: string, name: string): Promise<boolean>` (reads package.json scripts)
- [X] T008 Create `src/cli.ts` skeleton — import commander, create `Program`, wire `name`/`description`, read version from package.json via `createRequire`, export `program`; append `program.parse(process.argv)` at bottom

**Checkpoint**: `pnpm --filter @ashcoolman/contract-slice typecheck` passes on utils — user story work can begin.

---

## Phase 3: User Story 1 — Install Claude workflow commands (Priority: P1) 🎯 MVP

**Goal**: `cslice init` installs six Claude command files under `.claude/commands/` relative to `--target` (or cwd), printing `CREATE`/`SKIP`/`OVERWRITE` per file. Default install also includes `scripts/cslice-verify.sh` and four `.dev/contract-slice/` doc files.

**Independent Test**: `node dist/cli.js init --target /tmp/cslice-test && ls /tmp/cslice-test/.claude/commands/` — six `.md` files present.

### Template Files for User Story 1

- [X] T009 [P] [US1] Create `src/templates/claude/commands/cslice.intent.md` — frontmatter `description: Turn loose implementation intent into a bounded Contract Slice input`; output template with sections: Intent / User-visible behaviour / Known constraints / Non-goals / Suspected risk areas / Likely affected files / Blocking questions; include rules (preserve uncertainty, do not invent architecture, keep slice implementation-sized)
- [X] T010 [P] [US1] Create `src/templates/claude/commands/cslice.contract.md` — frontmatter `description: Discover contracts, invariants, edge cases, and gates from a Contract Slice intent`; output template with sections: Preconditions / Postconditions / Invariants / Edge cases / Failure modes / Type expectations / Runtime validation points / Test properties / Hard gates / Implementation constraints; rules (discover from intent, prefer executable checks, no implementation)
- [X] T011 [P] [US1] Create `src/templates/claude/commands/cslice.review.md` — frontmatter `description: Review a discovered Contract Slice contract before tests or implementation`; find-list (fake certainty, missing invariants, untestable claims, over-specific assumptions, missing failure modes, weak gates, scope creep); output template: Blockers / Weak contracts / Missing checks / Over-specified parts / Suggested contract edits / Minimal revised contract; rules (be skeptical, preserve useful uncertainty)
- [X] T012 [P] [US1] Create `src/templates/claude/commands/cslice.tests.md` — frontmatter `description: Generate tests from the Contract Slice contract`; rules (change tests only, no production code, no weakening, add example→property→type→runtime tests in order, stop if contract contradicts implementation); output template: Files changed / Example tests added / Property tests added / Type tests added / Runtime validation tests added / Contract conflicts
- [X] T013 [P] [US1] Create `src/templates/claude/commands/cslice.implement.md` — frontmatter `description: Implement one Contract Slice inside the generated guardrails`; rules (minimal diff, stay inside listed files, no weakening tests/gates, no new deps without approval, no any/ts-ignore/skipped-tests/broad-refactors, stop if contract is wrong); output template: Files changed / Contract points satisfied / Tests expected to pass / Deviations from contract / Gates to run
- [X] T014 [P] [US1] Create `src/templates/claude/commands/cslice.verify.md` — frontmatter `description: Verify implementation against the Contract Slice contract and hard gates`; check list (typecheck, unit tests, type tests, property tests, lint, build, suspicious test weakening, out-of-scope files, new any/ts-ignore, skipped tests, lowered thresholds, snapshot churn, contract drift); output template: PASS/FAIL / Commands run / Failing checks / Suspicious changes / Contract drift / Minimal fix; rules (no hiding failures, no claiming success unless commands passed)
- [X] T015 [P] [US1] Create `src/templates/scripts/cslice-verify.sh` — `#!/usr/bin/env sh`, `set -eu`; git diff whitespace check; warn on dependency file changes; fail on skipped/focused tests in staged diff; fail on ts-ignore/as-any in staged diff; warn on coverage threshold changes; `run_if_present` helper that calls typecheck/test/lint/build if the script exists in pnpm; print PASS on success
- [X] T016 [P] [US1] Create four doc templates: `src/templates/docs/contract-slice.md` (workflow overview, commands list), `src/templates/docs/theory.md` (best-fit stacks, why TS needs extra guardrails, good TS tools), `src/templates/docs/intent-template.md` (blank intent form), `src/templates/docs/contract-template.md` (blank contract form)

### Implementation for User Story 1

- [X] T017 [US1] Implement `src/commands/init.ts` — export `buildInitCommand(program: Command)`; parse InitOptions (dryRun, force, target, claudeCommands, skill, scripts, docs, all); apply derived rule (all flags false → install commands+scripts+docs); build TemplateEntry arrays per data-model.md manifest; call `copyTemplate`; print each FileResult as `<ACTION>  <path>`; exit 1 if `--target` dir does not exist
- [X] T018 [US1] Wire init into `src/cli.ts` — import `buildInitCommand` and call it; register all flags (`--dry-run`, `--force`, `--target <dir>`, `--claude-commands`, `--skill`, `--scripts`, `--all`) per contracts/cli.md
- [X] T019 [US1] Write `test/init.test.ts` — four US1 acceptance scenarios: (1) fresh dir → CREATE for each of six command files; (2) existing file without --force → SKIP, file unchanged; (3) existing file with --force → OVERWRITE, file replaced; (4) --dry-run → correct action labels printed, zero disk writes; use `fs.mkdtemp` for isolated temp dirs, clean up in afterEach

**Checkpoint**: `node dist/cli.js init --target /tmp/cslice-test` prints six CREATE lines; all files exist on disk.

---

## Phase 4: User Story 2 — Add optional skill reference files (Priority: P2)

**Goal**: `cslice init --skill` installs `SKILL.md` and six `references/*.md` files under `.claude/skills/contract-slice/`.

**Independent Test**: `node dist/cli.js init --skill --target /tmp/cslice-test && ls /tmp/cslice-test/.claude/skills/contract-slice/references/` — six `.md` files present.

### Template Files for User Story 2

- [X] T020 [P] [US2] Create `src/templates/skills/contract-slice/SKILL.md` — frontmatter `name: contract-slice`, `description: Use when turning loose implementation intent into AI-generated contracts, tests, gates, and then implementation`; workflow overview; when-to-use list; best-fit / anti-pattern lists; seven rules (preserve uncertainty → discover → review → generate tests → implement minimal diff → verify → inspect for cheating); links to references/
- [X] T021 [P] [US2] Create `src/templates/skills/contract-slice/references/theory.md` — best-fit stacks (Rust, strict TS, schema-heavy, data transforms, API adapters); weaker fits; why Rust works; why TypeScript types being erased means extra guardrails are needed; good TS tool pairings
- [X] T022 [P] [US2] Create `src/templates/skills/contract-slice/references/typescript-contracts.md` — patterns for expressing preconditions/postconditions/invariants in TypeScript: strict compiler settings, type-level tests with expectTypeOf/tsd, narrowed union types at boundaries
- [X] T023 [P] [US2] Create `src/templates/skills/contract-slice/references/runtime-schemas.md` — Zod/Valibot/ArkType usage at trust boundaries; parse-don't-validate; schema placement (entry points, external API responses, config loading)
- [X] T024 [P] [US2] Create `src/templates/skills/contract-slice/references/property-tests.md` — fast-check generator patterns for broad input spaces; when to prefer property over example tests; shrinking; model-based testing for state machines
- [X] T025 [P] [US2] Create `src/templates/skills/contract-slice/references/failure-modes.md` — common ways implementations drift from contracts: silent type widening, missing error paths, schema/type mismatch, test-only invariants; detection patterns
- [X] T026 [P] [US2] Create `src/templates/skills/contract-slice/references/hard-gates.md` — shell gate patterns for CI and pre-commit: detecting skipped/focused tests, ts-ignore/as-any, coverage threshold changes, snapshot churn, out-of-scope file changes; example gate script structure

### Implementation for User Story 2

- [X] T027 [US2] Extend `src/commands/init.ts` — add skill TemplateSet (SKILL.md + six references) to the manifest; enable when `opts.skill || opts.all`; target path `.claude/skills/contract-slice/`
- [X] T028 [US2] Extend `test/init.test.ts` with US2 scenarios: `--skill` creates SKILL.md and six reference files; plain `init` without `--skill` creates zero skill files

**Checkpoint**: `node dist/cli.js init --skill --target /tmp/cslice-test` installs default files plus SKILL.md and six reference files.

---

## Phase 5: User Story 3 — Check installation health (Priority: P3)

**Goal**: `cslice doctor` prints `PASS`/`WARN`/`FAIL` for each of 14 checks without creating or modifying any files. Exits 1 if any FAIL.

**Independent Test**: `node dist/cli.js doctor --target /tmp/cslice-test` in a post-init directory — all lines start with `PASS`.

### Implementation for User Story 3

- [X] T029 [US3] Implement `src/commands/doctor.ts` — export `buildDoctorCommand(program: Command)`; run 14 checks per contracts/cli.md order: (1–6) six command files present → FAIL if absent; (7) script file present → WARN; (8) script executable → WARN; (9) lockfile present → WARN; (10) tsconfig.json present → WARN; (11–14) typecheck/test/lint/build scripts in package.json → WARN; print each DoctorItem as `<STATUS> <label>`; exit 1 if any item is FAIL; use `detectPackageManager` and `hasScript` from detect-project.ts
- [X] T030 [US3] Wire doctor into `src/cli.ts` — import `buildDoctorCommand` and call it; register `--target <dir>` option
- [X] T031 [US3] Write `test/doctor.test.ts` — three US3 scenarios: (1) all command files present → all PASS; (2) script absent → that item WARN; (3) command file absent → that item FAIL and exit code 1; verify no files created or modified in temp dir

**Checkpoint**: `node dist/cli.js doctor` after a full init prints 14 PASS lines and exits 0.

---

## Phase 6: User Story 4 — Print a template to stdout (Priority: P4)

**Goal**: `cslice print <template>` prints the named command template to stdout; exits 1 for unknown names.

**Independent Test**: `node dist/cli.js print intent` — intent template markdown printed to stdout.

### Implementation for User Story 4

- [X] T032 [US4] Implement `src/commands/print.ts` — export `buildPrintCommand(program: Command)`; accept positional `template` arg; validate against `['intent','contract','review','tests','implement','verify']`; resolve path from templates root (`claude/commands/cslice.<name>.md`); read file and write to `process.stdout`; exit 1 with error message for unknown name
- [X] T033 [US4] Wire print into `src/cli.ts` — import `buildPrintCommand` and call it; register positional `<template>` argument

**Checkpoint**: `node dist/cli.js print intent` outputs intent template; `node dist/cli.js print unknown` exits 1.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, README, and smoke test.

- [X] T034 [P] Create `README.md` — package tagline, install via `pnpm dlx`, workflow diagram (Intent→Contract→Review→Tests→Implementation→Verification), six command names with one-line descriptions, what `cslice init` generates, theory summary (best-fit stacks, why TS needs runtime schemas)
- [X] T035 [P] Typecheck: `pnpm --filter @ashcoolman/contract-slice typecheck` — fix all TypeScript errors; ensure all `.ts` imports use `.js` extension (NodeNext requirement)
- [X] T036 Test suite: `pnpm --filter @ashcoolman/contract-slice test` — all tests in `test/init.test.ts` and `test/doctor.test.ts` must pass
- [X] T037 Build: `pnpm --filter @ashcoolman/contract-slice build` — confirm `dist/cli.js`, `dist/commands/init.js`, `dist/commands/doctor.js`, `dist/commands/print.js`, `dist/utils/*.js` all exist
- [X] T038 Smoke test: `node dist/cli.js init --dry-run --target /tmp/cslice-smoke` per quickstart.md — six CREATE lines printed, `/tmp/cslice-smoke` directory unchanged

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2
- **US2 (Phase 4)**: Depends on US1 init.ts being implemented (T017) — extends it
- **US3 (Phase 5)**: Depends on Phase 2 — independent of US1/US2
- **US4 (Phase 6)**: Depends on Phase 2 — independent of US1/US2/US3
- **Polish (Phase 7)**: Depends on all user story phases complete

### User Story Dependencies

- **US1 (P1)**: Unblocked after Phase 2
- **US2 (P2)**: Blocked on T017 (init.ts implementation); template files T020–T026 can be created in parallel with US1 template work
- **US3 (P3)**: Unblocked after Phase 2; can run in parallel with US1 and US2
- **US4 (P4)**: Unblocked after Phase 2; can run in parallel with US1, US2, US3

### Within Each User Story

- Template files (all [P]) → implementation task → wire task → test task
- Tests written after implementation (spec doesn't prescribe TDD order)

### Parallel Opportunities

- Phase 1: T003 parallelizable with T001, T002, T004
- Phase 2: T007 parallelizable with T005, T006, T008
- Phase 3 templates: T009–T016 all parallelizable with each other
- Phase 4 templates: T020–T026 all parallelizable with each other (and with Phase 3 templates if desired)
- Phase 7: T034, T035 parallelizable

---

## Parallel Example: User Story 1 Template Files

```bash
# All six command templates + script + docs can be created simultaneously:
Task: "Create src/templates/claude/commands/cslice.intent.md"     # T009
Task: "Create src/templates/claude/commands/cslice.contract.md"   # T010
Task: "Create src/templates/claude/commands/cslice.review.md"     # T011
Task: "Create src/templates/claude/commands/cslice.tests.md"      # T012
Task: "Create src/templates/claude/commands/cslice.implement.md"  # T013
Task: "Create src/templates/claude/commands/cslice.verify.md"     # T014
Task: "Create src/templates/scripts/cslice-verify.sh"             # T015
Task: "Create four doc templates in src/templates/docs/"          # T016

# Then after all template files exist:
Task: "Implement src/commands/init.ts"   # T017
Task: "Wire init into src/cli.ts"        # T018
Task: "Write test/init.test.ts"          # T019
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (six command files + scripts + docs installed by default)
4. **STOP and VALIDATE**: `node dist/cli.js init --target /tmp/cslice-test` — six files created, all tests pass
5. This is the minimum publishable state

### Incremental Delivery

1. Phase 1 + 2 → typechecks clean
2. Phase 3 (US1) → `cslice init` installs six command files **(MVP)**
3. Phase 4 (US2) → `cslice init --skill` adds skill files
4. Phase 5 (US3) → `cslice doctor` checks health
5. Phase 6 (US4) → `cslice print` outputs templates
6. Phase 7 → build verified, README done, smoke test passes

---

## Notes

- Import paths in NodeNext ESM must use `.js` extension even for `.ts` source (e.g. `import { mkdirp } from './fs.js'`)
- `cslice-verify.sh` TemplateEntry must have `executable: true` so `chmodX` is called after copy
- Author in `package.json`: `Ash Coolman <banquet.poll-4g@icloud.com>` — not "Coleman", not "writetofish@*"
- Template content for all six command files is specified in full in the original feature description and in spec.md; use that as the source of truth
- `src/templates/` is shipped as-is (not compiled); `package.json#files` includes `["dist","src/templates"]`
- All `test/` files should use `node:os` `tmpdir` for isolated fixture dirs and clean up in `afterEach`
