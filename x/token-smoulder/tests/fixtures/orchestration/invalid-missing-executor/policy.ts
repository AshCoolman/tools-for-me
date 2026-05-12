import { and, type Policy } from '../../../../src/core/predicates/compose.js';
import { enoughQuota } from '../../../../src/core/predicates/capacity.js';
import { safeRiskClass } from '../../../../src/core/predicates/risk.js';

export const policy: Policy = ctx =>
  and([
    enoughQuota('week', ctx.quotaSource, 0.25),
    safeRiskClass(['readonly'], ctx.riskClass),
  ]);
