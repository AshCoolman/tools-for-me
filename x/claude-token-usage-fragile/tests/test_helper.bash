#!/usr/bin/env bash
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATUSLINE="${REPO_ROOT}/scripts/usage-statusline"
START="${REPO_ROOT}/scripts/start"
FIXTURES="${REPO_ROOT}/tests/fixtures"

setup_temp_home() {
  TEST_HOME="$(mktemp -d "${TMPDIR:-/tmp}/usage-statusline.test.XXXXXX")"
  mkdir -p "${TEST_HOME}/.claude"
  export HOME="$TEST_HOME"
}

teardown_temp_home() {
  [ -n "${TEST_HOME:-}" ] && rm -rf "$TEST_HOME"
}
