#!/usr/bin/env bats

load '../test_helper'

setup() { setup_temp_home; }
teardown() { teardown_temp_home; }

@test "start install: writes statusLine entry to ~/.claude/settings.json" {
  run "$START" install
  [ "$status" -eq 0 ]
  [[ "$output" =~ "PASS: statusline registered" ]]

  cmd="$(jq -r '.statusLine.command' "${HOME}/.claude/settings.json")"
  type="$(jq -r '.statusLine.type'    "${HOME}/.claude/settings.json")"
  [ "$cmd"  = "$STATUSLINE" ]
  [ "$type" = "command" ]

  perm="$(stat -f '%A' "${HOME}/.claude/settings.json")"
  [ "$perm" = "600" ]
}

@test "start install: idempotent — running twice is harmless" {
  "$START" install
  "$START" install
  [ "$(jq -r '.statusLine.command' "${HOME}/.claude/settings.json")" = "$STATUSLINE" ]
}

@test "start install: preserves other settings.json fields" {
  printf '%s\n' '{"existingKey":"existingValue"}' > "${HOME}/.claude/settings.json"
  "$START" install
  [ "$(jq -r '.existingKey' "${HOME}/.claude/settings.json")" = "existingValue" ]
  [ "$(jq -r '.statusLine.command' "${HOME}/.claude/settings.json")" = "$STATUSLINE" ]
}

@test "start install: refuses if settings.json is malformed" {
  printf 'not-json{[' > "${HOME}/.claude/settings.json"
  run "$START" install
  [ "$status" -ne 0 ]
  [[ "$output" =~ "FAIL:" ]]
}

@test "start uninstall: removes our statusLine, leaves other fields" {
  printf '%s\n' '{"existingKey":"existingValue"}' > "${HOME}/.claude/settings.json"
  "$START" install
  "$START" uninstall
  [ "$(jq -r '.statusLine // "absent"' "${HOME}/.claude/settings.json")" = "absent" ]
  [ "$(jq -r '.existingKey' "${HOME}/.claude/settings.json")" = "existingValue" ]
}

@test "start uninstall: leaves a statusLine that points elsewhere" {
  printf '%s\n' '{"statusLine":{"type":"command","command":"/somewhere/else"}}' > "${HOME}/.claude/settings.json"
  run "$START" uninstall
  [ "$status" -eq 0 ]
  [ "$(jq -r '.statusLine.command' "${HOME}/.claude/settings.json")" = "/somewhere/else" ]
}

@test "start uninstall: no-op when no settings.json" {
  run "$START" uninstall
  [ "$status" -eq 0 ]
  [[ "$output" =~ "nothing to uninstall" ]]
}
