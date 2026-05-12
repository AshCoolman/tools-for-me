import type { Storage, LockScope, Event } from '../adapters/storage/interface.js';
import type { LockFile } from '../adapters/storage/internal-types.js';

export class LockContentionError extends Error {
  readonly scope: LockScope;
  constructor(scope: LockScope, original: string) {
    super(`lock contention: ${scopeLabel(scope)}: ${original}`);
    this.name = 'LockContentionError';
    this.scope = scope;
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isLockStale(lock: LockFile, maxAgeMs: number): boolean {
  if (!isPidAlive(lock.pid)) return true;
  const acquired = Date.parse(lock.acquiredAt);
  if (!Number.isFinite(acquired)) return true;
  return Date.now() - acquired > maxAgeMs;
}

export async function recordStaleLock(
  storage: Storage,
  scope: LockScope,
  lock: LockFile,
): Promise<void> {
  await storage.appendEvent({
    name: 'lock_stale',
    timestamp: new Date().toISOString(),
    ...lockEventBase(scope, lock),
  });
}

function scopeLabel(scope: LockScope): string {
  if (scope.scope === 'orchestration') return `orchestration:${scope.orchestrationName}`;
  return scope.scope;
}

function lockEventBase(scope: LockScope, lock?: LockFile): Pick<Event, 'orchestrationName' | 'payload'> {
  return {
    ...(scope.scope === 'orchestration' ? { orchestrationName: scope.orchestrationName } : {}),
    payload: {
      scope: scope.scope,
      ...(scope.scope === 'orchestration' ? { name: scope.orchestrationName } : {}),
      ...(lock ? { pid: lock.pid } : {}),
    },
  };
}

export async function acquireLock(storage: Storage, scope: LockScope): Promise<LockFile> {
  let lock: LockFile;
  try {
    lock = await storage.acquireLock(scope, 'scheduler');
  } catch (e) {
    throw new LockContentionError(scope, e instanceof Error ? e.message : String(e));
  }
  await storage.appendEvent({
    name: 'lock_acquired',
    timestamp: new Date().toISOString(),
    ...lockEventBase(scope, lock),
  });
  return lock;
}

export async function releaseLock(storage: Storage, scope: LockScope, lock?: LockFile): Promise<void> {
  await storage.releaseLock(scope);
  await storage.appendEvent({
    name: 'lock_released',
    timestamp: new Date().toISOString(),
    ...lockEventBase(scope, lock),
  });
}
