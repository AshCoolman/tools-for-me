import { and, type Policy } from '../../../../src/core/predicates/compose.js';
import { safeRiskClass } from '../../../../src/core/predicates/risk.js';

export const policy: Policy = ctx => and([safeRiskClass(['readonly'], ctx.riskClass)]);
