export function friendlyBlockingReason(raw: string): string {
  if (/enoughQuota.*week/i.test(raw)) return 'Weekly quota too low';
  if (/enoughQuota.*session/i.test(raw)) return 'Session quota too low';
  if (/enoughQuota/i.test(raw)) return 'Insufficient quota';
  if (/noExternalActiveSessions/i.test(raw)) return 'Another session is active';
  if (/keyboardIdle/i.test(raw)) return 'Keyboard activity detected';
  if (/timeWindow/i.test(raw)) return 'Outside scheduled time window';
  if (/safeRiskClass.*not in allowlist/i.test(raw)) return 'Risk level not allowed unattended';
  if (/safeRiskClass/i.test(raw)) return 'Risk check failed';
  if (/queuedWorkExists/i.test(raw)) return 'No queued work found';
  if (/workFileChanged/i.test(raw)) return 'Work unchanged since last run';
  return raw
    .replace(/^(pass|fail|gate)[:_-]\s*/i, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .trim()
    .toLowerCase();
}

export function friendlyGateName(raw: string): string {
  if (/enoughQuota.*week/i.test(raw)) return 'weekly quota';
  if (/enoughQuota.*session/i.test(raw)) return 'session quota';
  if (/enoughQuota/i.test(raw)) return 'quota';
  if (/noExternalActiveSessions/i.test(raw)) return 'no active sessions';
  if (/keyboardIdle/i.test(raw)) return 'keyboard idle';
  if (/timeWindow/i.test(raw)) return 'time window';
  if (/safeRiskClass/i.test(raw)) return 'safety level';
  if (/queuedWorkExists/i.test(raw)) return 'work available';
  if (/workFileChanged/i.test(raw)) return 'work changed';
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
  'readonly': 'Read-only — no writes to disk or network',
  'repo-local': 'Writes stay inside the local repository',
  'low-risk-write': 'Minor writes unlikely to cause damage',
  'networked': 'Makes network requests (API calls, downloads)',
  'destructive': 'Potentially destructive — never runs unattended',
  'privileged': 'Needs elevated privileges — never runs unattended',
};

export const STATUS_HELP: Record<string, string> = {
  'queued': 'In the queue, waiting for conditions to align',
  'waiting': 'Conditions not met yet (quota, time window, or active session)',
  'running': 'Executing right now',
  'paused': 'Manually paused mid-run',
  'failed': 'Last run hit an error',
  'completed': 'Finished successfully',
  'stopped': 'Auto-stopped after repeated failures (clear to retry)',
};

export const PREDICATE_HELP: Record<string, string> = {
  'enoughQuota(threshold, "week")': 'Passes when weekly API quota is above the threshold',
  'enoughQuota(threshold, "session")': 'Passes when session API quota is above the threshold',
  'noExternalActiveSessions()': 'Passes when no other Claude Code sessions are running',
  'keyboardIdleFor(minutes)': 'Passes when no keyboard input for the given duration',
  'safeRiskClass(allowlist)': 'Passes when the task risk level is in the allowed list',
  'queuedWorkExists()': 'Passes when there is pending work in the queue',
  'workFileChanged()': 'Passes when work.md has been modified since last run',
};

export const TERM_HELP: Record<string, string> = {
  'queue': 'Background process that checks conditions and dispatches tasks. Pause to stop all dispatch.',
  'dispatch': 'When the daemon starts a task because all conditions are met',
  'session active': 'Another Claude Code session is running — dispatch paused',
  'idle': 'No external sessions detected — safe to dispatch',
  'safety level': 'How risky the task is (readonly, repo-local, destructive, etc.)',
  'budget': 'Daily limit on how many tasks can run, resets each cycle',
  'unlock': 'Remove the lock file so a task can be dispatched again',
};
