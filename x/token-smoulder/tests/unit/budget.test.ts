import { describe, expect, it } from 'vitest';
import {
  isCycleExpired,
  startCycle,
  computeConsumed,
  isExhausted,
  cycleResetIn,
  checkBudget,
} from '../../src/core/budget.js';
import type { DailyBudget } from '../../src/core/types.js';
import type { QuotaSource } from '../../src/adapters/quota/interface.js';

function makeBudget(overrides?: Partial<DailyBudget>): DailyBudget {
  return {
    ceiling: 0.5,
    cycleDurationMs: 86_400_000,
    cycleStartedAt: null,
    snapshotAtCycleStart: null,
    ...overrides,
  };
}

const mockQuota = (week: number): QuotaSource => ({
  read: async () => ({ session: 1, week, sampledAt: new Date().toISOString(), source: 'test' }),
});

const failingQuota: QuotaSource = {
  read: async () => { throw new Error('quota unavailable'); },
};

describe('isCycleExpired', () => {
  it('returns true when no cycle has started', () => {
    expect(isCycleExpired(makeBudget(), Date.now())).toBe(true);
  });

  it('returns false when cycle is within duration', () => {
    const now = Date.now();
    const budget = makeBudget({ cycleStartedAt: new Date(now - 1000).toISOString() });
    expect(isCycleExpired(budget, now)).toBe(false);
  });

  it('returns true when cycle has elapsed', () => {
    const now = Date.now();
    const budget = makeBudget({
      cycleStartedAt: new Date(now - 86_400_001).toISOString(),
    });
    expect(isCycleExpired(budget, now)).toBe(true);
  });
});

describe('startCycle', () => {
  it('snapshots the weekRemainingFraction', () => {
    const budget = makeBudget();
    const result = startCycle(budget, 0.8, '2026-05-17T00:00:00Z');
    expect(result.snapshotAtCycleStart).toBe(0.8);
    expect(result.cycleStartedAt).toBe('2026-05-17T00:00:00Z');
  });
});

describe('computeConsumed', () => {
  it('returns 0 when no snapshot', () => {
    expect(computeConsumed(makeBudget(), 0.7)).toBe(0);
  });

  it('computes delta correctly', () => {
    const budget = makeBudget({ snapshotAtCycleStart: 0.8 });
    expect(computeConsumed(budget, 0.6)).toBeCloseTo(0.2);
  });

  it('floors at 0 if current is higher than snapshot', () => {
    const budget = makeBudget({ snapshotAtCycleStart: 0.5 });
    expect(computeConsumed(budget, 0.7)).toBe(0);
  });
});

describe('isExhausted', () => {
  it('returns false when consumed < ceiling', () => {
    const budget = makeBudget({ ceiling: 0.5, snapshotAtCycleStart: 0.8 });
    expect(isExhausted(budget, 0.5)).toBe(false);
  });

  it('returns true when consumed >= ceiling', () => {
    const budget = makeBudget({ ceiling: 0.2, snapshotAtCycleStart: 0.8 });
    expect(isExhausted(budget, 0.5)).toBe(true);
  });
});

describe('cycleResetIn', () => {
  it('returns null when no cycle', () => {
    expect(cycleResetIn(makeBudget(), Date.now())).toBeNull();
  });

  it('returns remaining time', () => {
    const now = Date.now();
    const budget = makeBudget({
      cycleStartedAt: new Date(now - 3600_000).toISOString(),
    });
    const remaining = cycleResetIn(budget, now);
    expect(remaining).toBeCloseTo(86_400_000 - 3600_000, -3);
  });
});

describe('checkBudget', () => {
  it('starts a new cycle when expired', async () => {
    const budget = makeBudget();
    const { budget: updated, status } = await checkBudget(budget, mockQuota(0.8), Date.now());
    expect(updated.cycleStartedAt).not.toBeNull();
    expect(updated.snapshotAtCycleStart).toBe(0.8);
    expect(status.exhausted).toBe(false);
    expect(status.consumed).toBe(0);
  });

  it('reports exhaustion when consumed exceeds ceiling', async () => {
    const now = Date.now();
    const budget = makeBudget({
      cycleStartedAt: new Date(now - 1000).toISOString(),
      snapshotAtCycleStart: 0.8,
      ceiling: 0.1,
    });
    const { status } = await checkBudget(budget, mockQuota(0.6), now);
    expect(status.exhausted).toBe(true);
    expect(status.consumed).toBeCloseTo(0.2);
  });

  it('treats quota failure as exhausted (conservative failure)', async () => {
    const now = Date.now();
    const budget = makeBudget({
      cycleStartedAt: new Date(now - 1000).toISOString(),
      snapshotAtCycleStart: 0.8,
    });
    const { status } = await checkBudget(budget, failingQuota, now);
    expect(status.exhausted).toBe(true);
  });

  it('treats quota failure during cycle start as exhausted', async () => {
    const budget = makeBudget();
    const { status } = await checkBudget(budget, failingQuota, Date.now());
    expect(status.exhausted).toBe(true);
  });
});
