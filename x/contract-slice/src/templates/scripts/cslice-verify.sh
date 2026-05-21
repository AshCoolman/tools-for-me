#!/usr/bin/env sh
set -eu

fail() {
  printf '%s\n' "FAIL: $*" >&2
  exit 1
}

run_if_present() {
  name="$1"

  if pnpm run | grep -E "^[[:space:]]*$name$|^[[:space:]]*$name[[:space:]]" >/dev/null 2>&1; then
    printf '%s\n' "RUN: pnpm $name"
    pnpm "$name"
  else
    printf '%s\n' "SKIP: pnpm $name not found"
  fi
}

git diff --check || fail "git diff whitespace check failed"

if git diff --cached --name-only | grep -E '(^|/)(package.json|pnpm-lock.yaml|yarn.lock|package-lock.json)$' >/dev/null 2>&1; then
  printf '%s\n' "WARN: dependency files changed"
fi

if git diff --cached | grep -E 'it\.skip|describe\.skip|test\.skip|\.only\(' >/dev/null 2>&1; then
  fail "skipped/focused tests found in staged diff"
fi

if git diff --cached | grep -E '@ts-ignore|@ts-expect-error|as any|: any' >/dev/null 2>&1; then
  fail "unsafe TypeScript escape hatch found in staged diff"
fi

if git diff --cached | grep -E 'coverageThreshold|threshold|minimumCoverage' >/dev/null 2>&1; then
  printf '%s\n' "WARN: possible coverage threshold change"
fi

run_if_present typecheck
run_if_present test
run_if_present lint
run_if_present build

printf '%s\n' "PASS"
