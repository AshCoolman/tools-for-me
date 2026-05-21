# Hard Gates

Hard gates are checks that must pass before a Contract Slice is considered complete.

## Gate categories

### Compiler gate
```sh
pnpm typecheck  # tsc --noEmit
```
Fails on type errors. Non-negotiable.

### Test gate
```sh
pnpm test
```
Fails on any test failure. Non-negotiable.

### Build gate
```sh
pnpm build
```
Confirms the output is producible. Required before release.

### Lint gate
```sh
pnpm lint
```
Catches style/rule violations. Configured per project.

### Suspicious diff gate (shell script)

The `cslice-verify.sh` script runs in CI or as a pre-commit hook:

```sh
# Fail on skipped/focused tests
git diff --cached | grep -E 'it\.skip|describe\.skip|test\.skip|\.only\(' && fail

# Fail on escape hatches
git diff --cached | grep -E '@ts-ignore|@ts-expect-error|as any|: any' && fail

# Warn on dependency changes
git diff --cached --name-only | grep -E 'package.json|pnpm-lock.yaml' && warn

# Warn on coverage threshold changes
git diff --cached | grep -E 'coverageThreshold|minimumCoverage' && warn
```

## Gate failure protocol

1. Gate fails → stop, do not merge
2. Read the failure message
3. Fix the root cause; do not bypass the gate
4. If the gate is wrong, discuss before disabling it

## Never skip gates to unblock

Do not use `--no-verify`, skip tests with `.skip`, or reduce thresholds to make a gate pass. The gate is the contract's last line of defence.

## Adding custom gates

For project-specific checks, extend `cslice-verify.sh`:

```sh
# Check for console.log in production code
if git diff --cached -- 'src/**/*.ts' | grep -E '^\+.*console\.log' >/dev/null 2>&1; then
  fail "console.log found in staged TypeScript files"
fi
```
