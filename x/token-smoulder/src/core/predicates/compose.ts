import type { Predicate, PredicateResult } from '../types.js';

export function and(preds: Predicate[]): Predicate {
  return async () => {
    const reasons: string[] = [];
    for (const p of preds) {
      const r = await p();
      if (!r.ok) {
        return { ok: false, reason: r.reason };
      }
      reasons.push(r.reason);
    }
    return { ok: true, reason: reasons.join(' & ') };
  };
}

export function or(preds: Predicate[]): Predicate {
  return async () => {
    const failed: string[] = [];
    for (const p of preds) {
      const r = await p();
      if (r.ok) return { ok: true, reason: r.reason };
      failed.push(r.reason);
    }
    return { ok: false, reason: failed.join(' | ') };
  };
}

export type PolicyContext = {
  orchestrationName: string;
  workHash: string;
  policyHash: string;
  executorHash: string;
  riskClass: import('../types.js').RiskClass;
  workMd: string;
  selectedSection: string;
  storage: {
    loadLatestRun(orchestrationName: string): Promise<{ workHash: string; status: string } | null>;
  };
};

export type Policy = (ctx: PolicyContext) => Predicate;

export function dispatchWhen(factory: Policy): Policy {
  return factory;
}

export function ok(reason: string): PredicateResult {
  return { ok: true, reason };
}

export function fail(reason: string): PredicateResult {
  return { ok: false, reason };
}
