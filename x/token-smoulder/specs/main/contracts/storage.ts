// Contract: Storage
// Persistence for runs, locks, suppressions, sessions, and the event log.
// The fs implementation lives at src/adapters/storage/fs.ts.

import type { RunRecord, SuppressionRecord, LockFile, AgentSession } from './internal-types';

export type EventName =
  | 'orchestration_discovered'
  | 'orchestration_invalid'
  | 'policy_evaluated'
  | 'dispatch_allowed'
  | 'dispatch_blocked'
  | 'run_started'
  | 'prompt_started'
  | 'prompt_completed'
  | 'input_requested'
  | 'input_received'
  | 'run_paused'
  | 'run_failed'
  | 'run_completed'
  | 'run_suppressed'
  | 'lock_acquired'
  | 'lock_released'
  | 'lock_stale'
  | 'external_session_detected'
  | 'quota_insufficient'
  | 'tick_overran'
  | 'policy_changed';

export type Event = {
  name: EventName;
  timestamp: string; // ISO 8601 UTC
  orchestrationName?: string;
  runId?: string;
  payload?: Record<string, unknown>;
};

export type LockScope =
  | { scope: 'global' }
  | { scope: 'orchestration'; orchestrationName: string };

export type Storage = {
  appendEvent(event: Event): Promise<void>;
  readEvents(filter?: { sinceMs?: number; type?: EventName }): Promise<Event[]>;

  saveRun(record: RunRecord): Promise<void>;
  loadLatestRun(orchestrationName: string): Promise<RunRecord | null>;
  loadRun(orchestrationName: string, runId: string): Promise<RunRecord | null>;

  acquireLock(scope: LockScope, owner: 'scheduler'): Promise<LockFile>; // throws on contention
  releaseLock(scope: LockScope): Promise<void>;
  inspectLock(scope: LockScope): Promise<LockFile | null>;
  isLockStale(lock: LockFile, maxAgeMs: number): Promise<boolean>;

  saveSuppression(record: SuppressionRecord): Promise<void>;
  listActiveSuppressions(): Promise<SuppressionRecord[]>;
  clearSuppression(key: string): Promise<void>;

  saveSession(session: AgentSession): Promise<void>;
  loadSession(sessionId: string): Promise<AgentSession | null>;
};
