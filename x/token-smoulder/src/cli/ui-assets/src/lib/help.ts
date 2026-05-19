export function friendlyGateName(raw: string): string {
  const cleaned = raw
    .replace(/^(pass|fail|gate)[:_-]\s*/i, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .trim()
    .toLowerCase();
  const colonIdx = cleaned.indexOf(':');
  return colonIdx > 0 ? cleaned.slice(0, colonIdx).trim() : cleaned;
}

export const RISK_HELP: Record<string, string> = {
  'readonly': 'Read-only operations, no writes',
  'repo-local': 'Writes confined to the local repository',
  'low-risk-write': 'Minor writes unlikely to cause damage',
  'networked': 'Operations that make network requests',
  'destructive': 'Potentially destructive operations — blocked unattended',
  'privileged': 'Elevated privileges required — blocked unattended',
};

export const STATUS_HELP: Record<string, string> = {
  'queued': 'Awaiting dispatch by the daemon',
  'skipped': 'Policy gate failed; not dispatched this tick',
  'running': 'Currently executing prompt steps',
  'paused': 'Manually paused mid-run',
  'failed': 'A prompt step exited with error',
  'completed': 'All prompt steps finished successfully',
  'suppressed': 'Auto-skipped due to a repeated failure signature',
};

export const TERM_HELP: Record<string, string> = {
  'tick': 'Interval in milliseconds between daemon dispatch cycles',
  'daemon': 'Background process that periodically evaluates and dispatches work units',
  'usage': 'Current Claude API token consumption for rate-limit awareness',
  'external': 'An active Claude Code session outside token-smoulder detected via PID',
  'idle': 'No external Claude sessions detected — safe to dispatch',
  'unlock': 'Remove the lock file so a work unit can be dispatched again',
  'run': "Execute a work unit's prompt steps through the agent",
};
