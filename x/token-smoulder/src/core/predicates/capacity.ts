import type { QuotaScope, QuotaSource } from '../../adapters/quota/interface.js';
import { BoundaryError } from '../../lib/errors.js';
import type { Predicate } from '../types.js';

const DEFAULT_THRESHOLD = 0.25;

export function enoughQuota(scope: QuotaScope, source: QuotaSource, threshold = DEFAULT_THRESHOLD): Predicate {
  return quotaRemainingAbove(scope, threshold, source);
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
    if (value > threshold) {
      return { ok: true, reason: `enoughQuota(${scope}): remaining ${value} above threshold ${threshold}` };
    }
    return {
      ok: false,
      reason: `enoughQuota(${scope}): remaining ${value} below threshold ${threshold}`,
    };
  };
}
