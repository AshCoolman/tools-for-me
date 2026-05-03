#!/usr/bin/env bats

load '../test_helper'

@test "snapshot: rate_limits → conforming snapshot JSON on stdout" {
  run bash -c '"$1" --snapshot < "$2"' _ "$STATUSLINE" "${FIXTURES}/statusline-input.json"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.session.percent  == 42'              >/dev/null
  echo "$output" | jq -e '.week.percent     == 18'              >/dev/null
  echo "$output" | jq -e '.session.resetsAt | endswith("Z")'    >/dev/null
  echo "$output" | jq -e '.week.resetsAt    | endswith("Z")'    >/dev/null
  echo "$output" | jq -e '.scrapedAt        | endswith("Z")'    >/dev/null
  echo "$output" | jq -e '.raw.five_hour.used_percentage == 42' >/dev/null
  echo "$output" | jq -e '.raw.seven_day.used_percentage == 18' >/dev/null
}

@test "snapshot: resets_at translated from epoch seconds to ISO-8601 UTC" {
  run bash -c '"$1" --snapshot < "$2"' _ "$STATUSLINE" "${FIXTURES}/statusline-input.json"
  [ "$status" -eq 0 ]
  # 1777608000 = 2026-05-01T04:00:00Z
  [ "$(echo "$output" | jq -r .session.resetsAt)" = "2026-05-01T04:00:00Z" ]
  [ "$(echo "$output" | jq -r .week.resetsAt)"    = "2026-05-06T04:00:00Z" ]
}

@test "snapshot: --snapshot with no rate_limits prints nothing, exits 0" {
  run bash -c '"$1" --snapshot < "$2"' _ "$STATUSLINE" "${FIXTURES}/statusline-input-no-rate-limits.json"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "snapshot: --snapshot with only five_hour prints nothing, exits 0" {
  # Both fields required for a snapshot — partial input doesn't produce output.
  run bash -c '"$1" --snapshot < "$2"' _ "$STATUSLINE" "${FIXTURES}/statusline-input-five-hour-only.json"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "stdout (default mode): '5h:NN% 7d:NN%' when both rate limits present" {
  # Default mode tries to POST; we point at a dead port so it fails silently.
  dead="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
  export DASHBOARD_URL_OVERRIDE="http://127.0.0.1:${dead}/api/usage"
  run bash -c '"$1" < "$2"' _ "$STATUSLINE" "${FIXTURES}/statusline-input.json"
  [ "$status" -eq 0 ]
  [ "$output" = "5h:42% 7d:18%" ]
}

@test "stdout: '5h:NN%' when only five_hour present" {
  dead="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
  export DASHBOARD_URL_OVERRIDE="http://127.0.0.1:${dead}/api/usage"
  run bash -c '"$1" < "$2"' _ "$STATUSLINE" "${FIXTURES}/statusline-input-five-hour-only.json"
  [ "$status" -eq 0 ]
  [ "$output" = "5h:42%" ]
}

@test "stdout: empty when no rate_limits" {
  dead="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
  export DASHBOARD_URL_OVERRIDE="http://127.0.0.1:${dead}/api/usage"
  run bash -c '"$1" < "$2"' _ "$STATUSLINE" "${FIXTURES}/statusline-input-no-rate-limits.json"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "malformed stdin: jq fails, exit non-zero" {
  run bash -c 'echo "not-json{[" | "$1" --snapshot' _ "$STATUSLINE"
  [ "$status" -ne 0 ]
}
