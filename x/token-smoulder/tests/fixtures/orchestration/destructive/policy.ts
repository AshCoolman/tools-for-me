import { and, type Policy } from '../../../../src/core/predicates/compose.js';
import { safeRiskClass } from '../../../../src/core/predicates/risk.js';
import type { RiskClass } from '../../../../src/core/types.js';

export const policy: Policy = ctx =>
  and([safeRiskClass(['destructive' as RiskClass], ctx.riskClass)]);
