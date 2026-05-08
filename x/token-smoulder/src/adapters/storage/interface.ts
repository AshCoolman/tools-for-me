import type {
  RunRecord,
  SuppressionRecord,
  LockFile,
  AgentSession,
  Event,
  EventName,
  LockScope,
} from './internal-types.js';

export type { Event, EventName, LockScope } from './internal-types.js';

export type Storage = {
  appendEvent(event: Event): Promise<void>;
  readEvents(filter?: { sinceMs?: number; type?: EventName }): Promise<Event[]>;

  saveRun(record: RunRecord): Promise<void>;
  loadLatestRun(orchestrationName: string): Promise<RunRecord | null>;
  loadRun(orchestrationName: string, runId: string): Promise<RunRecord | null>;

  acquireLock(scope: LockScope, owner: 'scheduler'): Promise<LockFile>;
  releaseLock(scope: LockScope): Promise<void>;
  inspectLock(scope: LockScope): Promise<LockFile | null>;
  isLockStale(lock: LockFile, maxAgeMs: number): Promise<boolean>;

  saveSuppression(record: SuppressionRecord): Promise<void>;
  loadSuppression(key: string): Promise<SuppressionRecord | null>;
  listActiveSuppressions(): Promise<SuppressionRecord[]>;
  clearSuppression(key: string): Promise<void>;

  saveSession(session: AgentSession): Promise<void>;
  loadSession(sessionId: string): Promise<AgentSession | null>;
};
