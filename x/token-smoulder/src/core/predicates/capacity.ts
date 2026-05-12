import type { QuotaScope, QuotaSource } from '../../adapters/quota/interface.js';
import { BoundaryError } from '../../lib/errors.js';
import type { Predicate } from '../types.js';

const DEFAULT_THRESHOLD = 0.25;

export function enoughQuota(scope: QuotaScope, source: QuotaSource, threshold: number): Predicate {
  (source as Record<string, unknown>).__quotaGateUsed = true;
  return quotaRemainingAbove(scope, threshold, source);
}

export function assertQuotaGateUsed(source: QuotaSource, orchestrationName: string): void {
  if (!(source as Record<string, unknown>).__quotaGateUsed) {
    throw new Error(`invalid policy for "${orchestrationName}": must include enoughQuota gate`);
  }
}

export function quotaRemainingAbove(
  scope: QuotaScope,
  threshold: number,
  source: QuotaSource,
): Predicate {
  return async () => {
    let snap;
    try {
      snap = await source.read();
    } catch (e) {
      const reason =
        e instanceof BoundaryError
          ? `enoughQuota(${scope}): boundary error ${e.endpoint} (${e.code})`
          : `enoughQuota(${scope}): unexpected error: ${e instanceof Error ? e.message : String(e)}`;
      return { ok: false, reason };
    }
    const value = snap[scope];
    const v = value.toFixed(3);
    const t = threshold.toFixed(3);
    if (value > threshold) {
      return { ok: true, reason: `enoughQuota(${scope}): remaining ${v} above threshold ${t}` };
    }
    return {
      ok: false,
      reason: `enoughQuota(${scope}): remaining ${v} below threshold ${t}`,
    };
  };
}
