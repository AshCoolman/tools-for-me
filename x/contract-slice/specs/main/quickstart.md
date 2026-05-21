# Quickstart: Implementing Contract Slice

## Prerequisites

- pnpm workspace confirmed (root `pnpm-workspace.yaml` includes `x/*`)
- Node.js 18+

## Bootstrap the package

```sh
mkdir -p x/contract-slice/src/{commands,templates/{claude/commands,skills/contract-slice/references,docs,scripts},utils}
mkdir -p x/contract-slice/test/fixtures/empty-repo
```

## Key files to create (in order)

1. `x/contract-slice/package.json` — name, bin, files, scripts, deps
2. `x/contract-slice/tsconfig.json` — NodeNext, strict, outDir dist
3. `x/contract-slice/vitest.config.ts`
4. `x/contract-slice/src/utils/fs.ts` — `mkdirp`, `fileExists`, `chmodX`
5. `x/contract-slice/src/utils/copy-template.ts` — `copyTemplate(entries, opts): FileResult[]`
6. `x/contract-slice/src/utils/detect-project.ts` — `detectPackageManager`, `hasScript`
7. `x/contract-slice/src/commands/init.ts` — `buildInitCommand(program)`
8. `x/contract-slice/src/commands/doctor.ts` — `buildDoctorCommand(program)`
9. `x/contract-slice/src/commands/print.ts` — `buildPrintCommand(program)`
10. `x/contract-slice/src/cli.ts` — wire commander program, parse
11. All template files under `src/templates/`

## Verify build

```sh
pnpm --filter @ashcoolman/contract-slice typecheck
pnpm --filter @ashcoolman/contract-slice build
pnpm --filter @ashcoolman/contract-slice test
```

## Smoke test

```sh
node x/contract-slice/dist/cli.js init --dry-run --target /tmp/cslice-test
```

## Template path resolution

Templates live at `src/templates/`. At runtime (post-build), they are resolved relative to the compiled CLI entry point:

```ts
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = resolve(__dirname, '..', 'src', 'templates');
```

`package.json#files` includes both `dist` and `src/templates` so both are present in the published package.
