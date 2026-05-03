# Exit Code Contract

The scraper exits with a numeric code that signals which step failed. launchd does not act on the code, but the operator (and `bats` tests) rely on it.

## Codes

| Code | Meaning                                                                                |
|------|----------------------------------------------------------------------------------------|
| `0`  | Success: upstream call returned 200, transform produced a valid snapshot, POST returned 2xx |
| `10` | `load` step failed (credentials missing, unreadable, or malformed)                     |
| `20` | `refresh` step failed (exchange non-2xx or atomic write-back failed)                   |
| `30` | `fetch` step failed (upstream non-200 or network/JSON error)                           |
| `40` | `transform` step failed (a required jq path returned null/wrong-type)                  |
| `50` | `post` step failed (dashboard non-2xx or connection refused)                           |
| `99` | Unhandled — should never occur; treated as a bug if seen                               |

## Invariants

- The script MUST NOT exit `0` if any step beyond `load` failed. Spec FR-008: "MUST NOT POST stale or partial data on failure."
- The script MUST exit promptly on first failure. No retries within a single invocation; the next 300-second cycle is the retry mechanism.
- Codes are stable; adding a new failure step MUST allocate a new code rather than reusing an existing one. Tests assert specific codes per failure scenario.

## Test coverage

Each non-zero code has a corresponding `bats` test that injects the failure (e.g. revoked refresh token, killed dashboard listener, tampered fixture) and asserts both the exit code and the matching `[fail] <step>` log line.
