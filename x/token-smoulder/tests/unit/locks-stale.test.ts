import { describe, expect, it } from 'vitest';
import { isLockStale } from '../../src/core/locks.js';
import type { LockFile } from '../../src/adapters/storage/internal-types.js';

const fresh = (over: Partial<LockFile> = {}): LockFile => ({
  pid: process.pid,
  hostname: 'localhost',
  acquiredAt: new Date().toISOString(),
  owner: 'scheduler',
  scope: 'orchestration',
  orchestrationName: 'demo',
  ...over,
});

describe('isLockStale', () => {
  it('returns true when pid is not alive', () => {
    expect(isLockStale(fresh({ pid: 9_999_999 }), 86_400_000)).toBe(true);
  });

  it('returns true when acquiredAt is older than maxAgeMs', () => {
    const old = new Date(Date.now() - 2 * 60_000).toISOString();
    expect(isLockStale(fresh({ acquiredAt: old }), 60_000)).toBe(true);
  });

  it('returns false when pid is alive and acquiredAt is recent', () => {
    expect(isLockStale(fresh(), 86_400_000)).toBe(false);
  });
});
