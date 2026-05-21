# Research: Contract Slice CLI Package

## Decision: Repo tooling

- **Decision**: pnpm workspace (already migrated). The plan description referred to Yarn/Lerna but that is outdated.
- **Rationale**: `pnpm-workspace.yaml` at repo root lists `x/*` glob. The commit `chore: remove Yarn config files and fix pre-commit hook after pnpm migration` confirms migration.
- **Implication**: `pnpm --filter @ashcoolman/contract-slice build` works without any workspace config changes. Package scripts use `pnpm`.

## Decision: TypeScript compilation target

- **Decision**: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"target": "ES2022"`, `"outDir": "dist"`.
- **Rationale**: Matches Node 18+ native ESM. NodeNext moduleResolution handles `.js` extension imports correctly for ESM output.
- **Alternatives considered**: CommonJS (`"module": "CommonJS"`) — simpler but limits interop with modern ESM packages. Chosen against because the ecosystem is moving to ESM and this is a new package.

## Decision: Template distribution strategy

- **Decision**: Templates are plain files under `src/templates/`. `package.json#files` includes `dist/` and the compiled output. Templates are read at runtime using `import.meta.url` + `fileURLToPath` to resolve the package-relative path.
- **Rationale**: No template engine needed. No string interpolation in templates. Files are copied verbatim.
- **Alternatives considered**: Embedding templates as TypeScript string literals — would bloat `cli.ts` and make template editing painful.

## Decision: Runtime dependencies

- **Decision**: `commander` for CLI parsing, `kleur` for ANSI colour output.
- **Rationale**: Minimal, well-maintained, no transitive dependencies of concern.
- **Alternatives considered**: `chalk` — same footprint but more opinionated. `kleur` is lighter. `yargs` — heavier than needed for a small CLI.

## Decision: Package author identity

- **Decision**: `"author": "Ash Coolman <banquet.poll-4g@icloud.com>"` — matches all other packages in the monorepo.
- **Rationale**: Consistent with `x/mini-speckit` package.json.

## Decision: `cslice init` default behaviour

- **Decision**: `cslice init` (no flags) installs commands + scripts + docs. `--skill` is additive. `--claude-commands` / `--scripts` / `--all` are sub-selections.
- **Rationale**: The six Claude command files are the minimum useful payload. Shipping them by default maximises initial value.

## Decision: Template file for `dist/` inclusion

- **Decision**: Compiled TypeScript puts templates into `dist/templates/` by copying them (or by referencing them relative to source). Use `tsc` with `"declaration": true` and ship `templates/` alongside `dist/`. In `package.json#files`: `["dist", "src/templates"]`.
- **Rationale**: `tsc` doesn't copy non-TS files. Shipping `src/templates` directly avoids a build step for template assets and keeps paths predictable via `import.meta.url`.

## Sibling package pattern

- Reference: `x/mini-speckit/package.json` — `"name": "@ashcoolman/mini-speckit"`, `"version": "1.0.2"`, MIT license, same author.
- `contract-slice` follows the same shape: `"name": "@ashcoolman/contract-slice"`, `"version": "0.1.0"`, MIT, same author.
