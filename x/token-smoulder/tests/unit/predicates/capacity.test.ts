import { describe, expect, it } from 'vitest';
import { enoughQuota, quotaRemainingAbove } from '../../../src/core/predicates/capacity.js';
import { BoundaryError } from '../../../src/lib/errors.js';
import type { QuotaSnapshot, QuotaSource } from '../../../specs/main/contracts/quota-source.js';

const fakeQuota = (snap: QuotaSnapshot | (() => never)): QuotaSource => ({
  read: async () => {
    if (typeof snap === 'function') return snap();
    return snap;
  },
});

const snap = (overrides: Partial<QuotaSnapshot>): QuotaSnapshot => ({
  session: 0.8,
  week: 0.5,
  sampledAt: '2026-05-06T00:00:00Z',
  source: 'test',
  ...overrides,
});

describe('enoughQuota', () => {
  it('passes when fraction above threshold', async () => {
    const r = await enoughQuota('week', fakeQuota(snap({ week: 0.5 })), 0.25)();
    expect(r.ok).toBe(true);
  });

  it('fails when fraction below threshold', async () => {
    const r = await enoughQuota('week', fakeQuota(snap({ week: 0.1 })), 0.25)();
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/0\.100/);
    expect(r.reason).toMatch(/0\.250/);
  });

  it('returns false on BoundaryError (conservative failure)', async () => {
    const broken: QuotaSource = {
      read: async () => {
        throw new BoundaryError({ endpoint: 'q', args: {}, code: 1, original: 'x' });
      },
    };
    const r = await enoughQuota('week', broken, 0.25)();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('boundary');
  });
});

describe('quotaRemainingAbove', () => {
  it('honours the supplied threshold', async () => {
    const above = await quotaRemainingAbove('session', 0.7, fakeQuota(snap({ session: 0.8 })))();
    const below = await quotaRemainingAbove('session', 0.7, fakeQuota(snap({ session: 0.6 })))();
    expect(above.ok).toBe(true);
    expect(below.ok).toBe(false);
  });
});
