import { describe, expect, it } from 'vitest';
import { noExternalActiveSessionsFor } from '../../../src/core/predicates/contention.js';
import type { ContentionDetector } from '../../../specs/main/contracts/contention-detector.js';

const fake = (impl: Partial<ContentionDetector>): ContentionDetector => ({
  listExternalSessions: async () => [],
  isActiveWithin: async () => false,
  ...impl,
});

describe('noExternalActiveSessionsFor', () => {
  it('passes when no sessions active in window', async () => {
    const r = await noExternalActiveSessionsFor(30 * 60_000, fake({ isActiveWithin: async () => false }))();
    expect(r.ok).toBe(true);
  });

  it('fails when a session is active in window', async () => {
    const r = await noExternalActiveSessionsFor(30 * 60_000, fake({ isActiveWithin: async () => true }))();
    expect(r.ok).toBe(false);
  });

  it('returns false on detector error (conservative failure)', async () => {
    const broken = fake({
      isActiveWithin: async () => {
        throw new Error('ps failed');
      },
    });
    const r = await noExternalActiveSessionsFor(30 * 60_000, broken)();
    expect(r.ok).toBe(false);
  });
});
