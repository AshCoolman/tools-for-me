import type { DailyBudget } from './types.js';
import type { QuotaSource } from '../adapters/quota/interface.js';

export type BudgetStatus = {
  ceiling: number;
  consumed: number;
  exhausted: boolean;
  cycleResetIn: number | null;
};

export function isCycleExpired(budget: DailyBudget, now: number): boolean {
  if (!budget.cycleStartedAt) return true;
  const start = Date.parse(budget.cycleStartedAt);
  if (!Number.isFinite(start)) return true;
  return now - start >= budget.cycleDurationMs;
}

export function startCycle(budget: DailyBudget, weekRemainingFraction: number, now: string): DailyBudget {
  return {
    ...budget,
    cycleStartedAt: now,
    snapshotAtCycleStart: weekRemainingFraction,
  };
}

export function computeConsumed(budget: DailyBudget, currentWeekRemaining: number): number {
  if (budget.snapshotAtCycleStart === null) return 0;
  return Math.max(0, budget.snapshotAtCycleStart - currentWeekRemaining);
}

export function isExhausted(budget: DailyBudget, currentWeekRemaining: number): boolean {
  const consumed = computeConsumed(budget, currentWeekRemaining);
  return consumed >= budget.ceiling;
}

export function cycleResetIn(budget: DailyBudget, now: number): number | null {
  if (!budget.cycleStartedAt) return null;
  const start = Date.parse(budget.cycleStartedAt);
  if (!Number.isFinite(start)) return null;
  const elapsed = now - start;
  const remaining = budget.cycleDurationMs - elapsed;
  return remaining > 0 ? remaining : 0;
}

export async function checkBudget(
  budget: DailyBudget,
  quotaSource: QuotaSource,
  now: number,
): Promise<{ budget: DailyBudget; status: BudgetStatus }> {
  if (isCycleExpired(budget, now)) {
    let weekRemaining: number;
    try {
      const snap = await quotaSource.read();
      weekRemaining = snap.week;
    } catch {
      return {
        budget,
        status: { ceiling: budget.ceiling, consumed: budget.ceiling, exhausted: true, cycleResetIn: null },
      };
    }
    const newBudget = startCycle(budget, weekRemaining, new Date(now).toISOString());
    return {
      budget: newBudget,
      status: {
        ceiling: newBudget.ceiling,
        consumed: 0,
        exhausted: false,
        cycleResetIn: newBudget.cycleDurationMs,
      },
    };
  }

  let weekRemaining: number;
  try {
    const snap = await quotaSource.read();
    weekRemaining = snap.week;
  } catch {
    return {
      budget,
      status: { ceiling: budget.ceiling, consumed: budget.ceiling, exhausted: true, cycleResetIn: cycleResetIn(budget, now) },
    };
  }

  const consumed = computeConsumed(budget, weekRemaining);
  const exhausted = consumed >= budget.ceiling;
  return {
    budget,
    status: {
      ceiling: budget.ceiling,
      consumed,
      exhausted,
      cycleResetIn: cycleResetIn(budget, now),
    },
  };
}
