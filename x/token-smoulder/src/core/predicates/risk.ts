import type { Predicate, RiskClass } from '../types.js';
import { RiskClassSchema } from '../types.js';

const ALWAYS_BLOCKED: ReadonlySet<RiskClass> = new Set(['destructive', 'privileged']);

export function safeRiskClass(allowed: RiskClass[], riskClass: RiskClass | string): Predicate {
  return async () => {
    const parsed = RiskClassSchema.safeParse(riskClass);
    if (!parsed.success) {
      return { ok: false, reason: `safeRiskClass: unknown class "${String(riskClass)}" (treated as destructive)` };
    }
    const cls = parsed.data;
    if (ALWAYS_BLOCKED.has(cls)) {
      return { ok: false, reason: `safeRiskClass: ${cls} is unconditionally blocked` };
    }
    if (!allowed.includes(cls)) {
      return {
        ok: false,
        reason: `safeRiskClass: ${cls} not in allowlist [${allowed.join(', ')}]`,
      };
    }
    return { ok: true, reason: `safeRiskClass([${allowed.join(', ')}])` };
  };
}

export function classifyRisk(declared: unknown): RiskClass {
  const r = RiskClassSchema.safeParse(declared);
  return r.success ? r.data : 'destructive';
}
