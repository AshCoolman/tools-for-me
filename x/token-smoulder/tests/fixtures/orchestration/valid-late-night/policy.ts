import { and, type Policy } from '../../../../src/core/predicates/compose.js';
import { enoughQuota } from '../../../../src/core/predicates/capacity.js';
import { queuedWorkExists } from '../../../../src/core/predicates/value.js';
import { safeRiskClass } from '../../../../src/core/predicates/risk.js';

export const policy: Policy = ctx =>
  and([
    enoughQuota('week', ctx.quotaSource, 0.25),
    queuedWorkExists({
      orchestrationName: ctx.orchestrationName,
      workMd: ctx.workMd,
      workHash: ctx.workHash,
      selectedSection: ctx.selectedSection,
      storage: ctx.storage,
    }),
    safeRiskClass(['readonly', 'repo-local', 'low-risk-write'], ctx.riskClass),
  ]);
