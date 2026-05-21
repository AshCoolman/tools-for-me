# Feature Specification: Contract Slice CLI Package

**Feature Branch**: `001-cslice-cli-package`

**Created**: 2026-05-21

**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Install Claude workflow commands (Priority: P1)

A TypeScript developer has a real implementation intent but no full spec. They run `cslice init` in their project root and immediately get six Claude command files installed under `.claude/commands/`, giving them the full `/cslice.*` workflow.

**Why this priority**: The Claude commands are the primary value delivery. Everything else supports them.

**Independent Test**: Run `cslice init --target /tmp/test-project` and verify six `.md` files exist under `/tmp/test-project/.claude/commands/`.

**Acceptance Scenarios**:

1. **Given** a directory with no `.claude/commands/` folder, **When** `cslice init` runs, **Then** `CREATE` is printed for each of the six command files and all files exist on disk.
2. **Given** a directory where `.claude/commands/cslice.intent.md` already exists, **When** `cslice init` runs without `--force`, **Then** `SKIP` is printed for that file and the file is unchanged.
3. **Given** a directory where `.claude/commands/cslice.intent.md` already exists, **When** `cslice init --force` runs, **Then** `OVERWRITE` is printed for that file and the file is replaced.
4. **Given** `cslice init --dry-run`, **When** the command runs, **Then** `CREATE`/`SKIP`/`OVERWRITE` lines are printed but no files are written to disk.

---

### User Story 2 — Add optional skill reference files (Priority: P2)

A developer wants the Claude skill context files so that Claude has compact background on the Contract Slice theory and TypeScript guardrails. They run `cslice init --skill`.

**Why this priority**: Skill files add depth but are optional — the six commands alone deliver the core workflow.

**Independent Test**: Run `cslice init --skill --target /tmp/test-project` and verify `SKILL.md` and all six reference files exist under `/tmp/test-project/.claude/skills/contract-slice/`.

**Acceptance Scenarios**:

1. **Given** a clean directory, **When** `cslice init --skill` runs, **Then** `SKILL.md` and six `references/*.md` files are created and printed.
2. **Given** `cslice init` without `--skill`, **When** the command completes, **Then** no skill files are written.

---

### User Story 3 — Check installation health (Priority: P3)

A developer runs `cslice doctor` to verify what is and isn't installed in their project, without any auto-fix.

**Why this priority**: Useful for onboarding and debugging but not critical to the primary workflow.

**Independent Test**: Run `cslice doctor` in a directory with some files present and some missing; verify each item reports `PASS`, `WARN`, or `FAIL`.

**Acceptance Scenarios**:

1. **Given** a project with all command files installed, **When** `cslice doctor` runs, **Then** each command file reports `PASS`.
2. **Given** a project with no `scripts/cslice-verify.sh`, **When** `cslice doctor` runs, **Then** that item reports `WARN`.
3. **Given** `cslice doctor`, **Then** no files are created or modified.

---

### User Story 4 — Print a template to stdout (Priority: P4)

A developer runs `cslice print intent` to get the intent template printed to stdout for copying or piping.

**Why this priority**: Convenience feature; the core workflow doesn't require it.

**Independent Test**: Run `cslice print intent` and verify the intent template markdown is printed to stdout.

**Acceptance Scenarios**:

1. **Given** `cslice print intent`, **When** run, **Then** the intent template markdown is printed to stdout.
2. **Given** `cslice print verify`, **When** run, **Then** the verify command template is printed to stdout.

---

### Edge Cases

- `--target` pointing to a non-existent directory: command fails with a clear error.
- `cslice init --all` installs everything (commands + skill + scripts + docs).
- `cslice print <unknown>` prints an error and non-zero exit.
- Running `cslice init` from inside a project with read-only files: reports failure per file, does not abort the whole run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `cslice init` MUST install six Claude command files under `.claude/commands/` relative to `--target` (or cwd).
- **FR-002**: `cslice init` MUST print `CREATE`, `SKIP`, or `OVERWRITE` for each file processed.
- **FR-003**: `cslice init` MUST NOT overwrite existing files unless `--force` is passed.
- **FR-004**: `cslice init --dry-run` MUST report what would happen without writing any files.
- **FR-005**: `cslice init --target <dir>` MUST use `<dir>` as the installation root.
- **FR-006**: `cslice init --skill` MUST install `SKILL.md` and six reference files under `.claude/skills/contract-slice/`.
- **FR-007**: `cslice init --scripts` MUST install `scripts/cslice-verify.sh` as an executable shell script.
- **FR-008**: `cslice init --all` MUST install commands, skill files, scripts, and docs in one pass.
- **FR-009**: `cslice doctor` MUST check for the presence of expected files and report `PASS`/`WARN`/`FAIL` per item.
- **FR-010**: `cslice doctor` MUST NOT create or modify any files.
- **FR-011**: `cslice print <template>` MUST print the named template to stdout.
- **FR-012**: The package MUST be publishable and runnable via `pnpm dlx @ashcoolman/contract-slice init`.
- **FR-013**: The package MUST have no postinstall scripts and make no network calls at runtime.

### Key Entities

- **CommandTemplate**: A `.md` file installed to `.claude/commands/`. Six exist: `intent`, `contract`, `review`, `tests`, `implement`, `verify`.
- **SkillFile**: A `.md` file installed to `.claude/skills/contract-slice/`. One `SKILL.md` + six `references/*.md`.
- **DocFile**: A `.md` file installed to `.dev/contract-slice/`. Four templates: `contract-slice.md`, `theory.md`, `intent-template.md`, `contract-template.md`.
- **VerifyScript**: `scripts/cslice-verify.sh` — a shell gate script installed as executable.
- **DoctorResult**: A per-item check result with status (`PASS`/`WARN`/`FAIL`) and message.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can install all command files in a new project in under 60 seconds end-to-end (including `npx`/`pnpm dlx` download time excluded; install command itself under 2 seconds).
- **SC-002**: All six command files are correctly installed with no content corruption.
- **SC-003**: Re-running `cslice init` on a project with existing files produces only `SKIP` lines — no existing files modified.
- **SC-004**: `cslice init --dry-run` produces zero disk writes.
- **SC-005**: `cslice doctor` accurately reports missing and present files with no false positives.
- **SC-006**: The package builds and passes typecheck with zero errors.
- **SC-007**: All test cases pass.

## Assumptions

- Repo is already on pnpm (migration confirmed; plan description referring to Yarn is outdated).
- `x/contract-slice` is a pnpm workspace package by virtue of the `x/*` glob in `pnpm-workspace.yaml`.
- Node.js 18+ is the minimum runtime target.
- Templates are embedded as files under `src/templates/` and shipped as package assets, not runtime-generated.
- `scripts/cslice-verify.sh` is only useful in TypeScript/pnpm projects and the generated script assumes `pnpm` is available.
- The package will use the same author identity as other packages in the mono repo: `Ash Coolman <banquet.poll-4g@icloud.com>`.
- `cslice init` without any flags installs all default assets (commands + scripts + docs); `--skill` is additive.
