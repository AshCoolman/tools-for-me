# Claude Usage Scraper (OAuth direct)

id: 001-claude-usage-scraper
source: speckit
lane: @ashcoolman/claude-token-usage-fragile
status: todo

priority: p4
## Intention

1. The operator installs the scraper once. Within 5 minutes, the local dashboard's "Usage" card shows current session and weekly percentages with reset timestamps, replacing its "stale data" hint. The card stays current across operator sessions without further attention.

## Signals

