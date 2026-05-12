#!/usr/bin/env bash
# Fake claude binary for e2e tests.
# Reads stdin (the prompt), writes valid JSON response to stdout.
cat > /dev/null
sleep 1
echo '{"type":"result","subtype":"success","is_error":false,"result":"ok","stop_reason":"end_turn","session_id":"fake-session","duration_ms":1000}'
