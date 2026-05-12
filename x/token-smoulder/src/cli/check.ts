import { FsStorage } from '../adapters/storage/fs.js';
import { Dispatcher, type GateSet } from '../core/dispatcher.js';
import { assertQuotaGateUsed } from '../core/predicates/capacity.js';
import { noExternalActiveSessionsFor } from '../core/predicates/contention.js';
import { safeRiskClass } from '../core/predicates/risk.js';
import {
  findOrchestrationDir,
  findStateDir,
  loadOrchestration,
} from './orchestration.js';
import type { PolicyContext } from '../core/predicates/compose.js';
import { selectContentionDetector, selectQuotaSource } from './wiring.js';
import type { DispatchDecision } from '../core/types.js';

export type CheckOptions = { json: boolean; strict: boolean; section?: string };

export type CheckDecisionResult =
  | { kind: 'decision'; decision: DispatchDecision }
  | { kind: 'boundary'; error: string };

const DEFAULT_ALLOWED = ['readonly', 'repo-local'] as const;

export async function checkDecision(
  name: string,
  opts: { section?: string } = {},
): Promise<CheckDecisionResult> {
  const orchDir = await findOrchestrationDir();
  const stateDir = await findStateDir();
  const storage = new FsStorage(stateDir);

  let orch;
  try {
    orch = await loadOrchestration(orchDir, name);
  } catch (e) {
    return { kind: 'boundary', error: e instanceof Error ? e.message : String(e) };
  }

  const quota = selectQuotaSource();
  const contention = selectContentionDetector();
  const quotaSource = { read: () => quota.read() };

  const policyCtx: PolicyContext = {
    orchestrationName: orch.name,
    workHash: orch.workHash,
    policyHash: orch.policyHash,
    executorHash: orch.executorHash,
    riskClass: orch.riskClass,
    workMd: orch.workMd,
    selectedSection: opts.section ?? 'Objective',
    storage,
    quotaSource,
  };

  const valueGate = orch.policy(policyCtx);
  assertQuotaGateUsed(quotaSource, orch.name);

  const gates: GateSet = {
    capacity: async () => ({ ok: true, reason: 'pass: capacity delegated to policy' }),
    contention: noExternalActiveSessionsFor(30 * 60_000, contention),
    value: valueGate,
    risk: safeRiskClass([...DEFAULT_ALLOWED], orch.riskClass),
  };

  const dispatcher = new Dispatcher({ storage, gates });
  const decision = await dispatcher.evaluate({
    orchestrationName: orch.name,
    workHash: orch.workHash,
    policyHash: orch.policyHash,
    executorHash: orch.executorHash,
    riskClass: orch.riskClass,
    storageRoot: stateDir,
  });

  return { kind: 'decision', decision };
}

export async function checkCommand(name: string, opts: CheckOptions): Promise<number> {
  const result = await checkDecision(name, { section: opts.section });
  if (result.kind === 'boundary') {
    process.stderr.write(`check: ${result.error}\n`);
    return 5;
  }
  const { decision } = result;

  if (opts.json) {
    process.stdout.write(JSON.stringify(decision));
  } else {
    process.stdout.write(`${decision.orchestrationName}: shouldRun=${decision.shouldRun}\n`);
    for (const r of decision.reasons) process.stdout.write(`  pass: ${r}\n`);
    for (const r of decision.failedReasons) process.stdout.write(`  fail: ${r}\n`);
  }

  if (opts.strict && !decision.shouldRun) return 3;
  return 0;
}
