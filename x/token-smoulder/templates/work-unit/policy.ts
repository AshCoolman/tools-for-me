import { and, type Policy } from '../../src/core/predicates/compose.js';
import { noTodoSentinels, queuedWorkExists } from '../../src/core/predicates/value.js';
import { safeRiskClass } from '../../src/core/predicates/risk.js';

export const policy: Policy = ctx =>
  and([
    noTodoSentinels(ctx.workMd),
    queuedWorkExists({
      orchestrationName: ctx.orchestrationName,
      workMd: ctx.workMd,
      workHash: ctx.workHash,
      selectedSection: ctx.selectedSection,
      storage: ctx.storage,
    }),
    safeRiskClass(['readonly'], ctx.riskClass),
  ]);
