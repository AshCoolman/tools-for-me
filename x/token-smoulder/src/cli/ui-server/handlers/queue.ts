import type { RouteHandler } from '../router.js';
import { json } from '../router.js';
import { FsStorage } from '../../../adapters/storage/fs.js';
import { findOrchestrationDir, findStateDir, loadOrchestration, scanOrchestrations } from '../../orchestration.js';
import { loadQueue, syncEntries, evaluateGateProximity } from '../../../core/queue.js';
import { checkBudget } from '../../../core/budget.js';
import { selectQuotaSource, selectContentionDetector } from '../../wiring.js';
import { assertQuotaGateUsed } from '../../../core/predicates/capacity.js';
import { noExternalActiveSessionsFor } from '../../../core/predicates/contention.js';
import { safeRiskClass } from '../../../core/predicates/risk.js';
import type { PolicyContext } from '../../../core/predicates/compose.js';

const DEFAULT_ALLOWED = ['readonly', 'repo-local'] as const;

export const getQueueBudget: RouteHandler = async (_req, res) => {
  const stateDir = await findStateDir();
  const queue = await loadQueue(stateDir);
  const quota = selectQuotaSource();
  const { status } = await checkBudget(queue.budget, quota, Date.now());
  json(res, 200, status);
};

export const getQueue: RouteHandler = async (_req, res) => {
  const stateDir = await findStateDir();
  const orchDir = await findOrchestrationDir();
  const storage = new FsStorage(stateDir);
  let queue = await loadQueue(stateDir);
  const scan = await scanOrchestrations(orchDir);
  queue = syncEntries(queue, scan.valid.map(v => v.name));

  const entries = Object.values(queue.entries);
  const quota = selectQuotaSource();
  const { status: budgetStatus } = await checkBudget(queue.budget, quota, Date.now());

  const gateResults = new Map<string, { passing: number; blocking: string[] }>();
  for (const e of entries) {
    if (!e.enabled || e.queueState !== 'pending') continue;
    try {
      const orch = await loadOrchestration(orchDir, e.name);
      const contention = selectContentionDetector();
      const quotaSource = { read: () => quota.read() };
      const policyCtx: PolicyContext = {
        orchestrationName: orch.name, workHash: orch.workHash,
        policyHash: orch.policyHash, executorHash: orch.executorHash,
        riskClass: orch.riskClass, workMd: orch.workMd,
        selectedSection: 'Objective', storage, quotaSource,
      };
      const valueGate = orch.policy(policyCtx);
      assertQuotaGateUsed(quotaSource, orch.name);
      const gateChecks: Array<[string, () => Promise<{ ok: boolean; reason: string }>]> = [
        ['capacity', async () => ({ ok: true, reason: 'pass: capacity delegated to policy' })],
        ['contention', noExternalActiveSessionsFor(30 * 60_000, contention)],
        ['value', valueGate],
        ['risk', safeRiskClass([...DEFAULT_ALLOWED], orch.riskClass)],
      ];
      let passing = 0;
      const blocking: string[] = [];
      for (const [gn, gf] of gateChecks) {
        const r = await gf();
        if (r.ok) passing++;
        else blocking.push(gn);
      }
      gateResults.set(e.name, { passing, blocking });
    } catch {
      gateResults.set(e.name, { passing: 0, blocking: ['error'] });
    }
  }

  const proximity = evaluateGateProximity(entries, gateResults);
  json(res, 200, { entries, budget: budgetStatus, proximity });
};
