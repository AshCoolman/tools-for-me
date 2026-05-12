import { ClaudeCodeAgent } from '../adapters/agent/claude-code.js';
import { FsStorage } from '../adapters/storage/fs.js';
import { Dispatcher, type GateSet } from '../core/dispatcher.js';
import { acquireLock, LockContentionError, releaseLock } from '../core/locks.js';
import { assertQuotaGateUsed } from '../core/predicates/capacity.js';
import { noExternalActiveSessionsFor } from '../core/predicates/contention.js';
import { safeRiskClass } from '../core/predicates/risk.js';
import { Runner, RunKilledError } from '../core/runner.js';
import { BoundaryError } from '../lib/errors.js';
import {
  findOrchestrationDir,
  findStateDir,
  loadOrchestration,
} from './orchestration.js';
import { selectContentionDetector, selectHumanInputChannel, selectQuotaSource } from './wiring.js';
import type { PolicyContext } from '../core/predicates/compose.js';
import type { DispatchDecision } from '../core/types.js';

const DEFAULT_ALLOWED = ['readonly', 'repo-local'] as const;

const activeRunners = new Map<string, Runner>();

export function killActiveRun(orchestrationName: string): boolean {
  const runner = activeRunners.get(orchestrationName);
  if (!runner) return false;
  runner.abort();
  return true;
}

export type RunOptions = { json: boolean; once: boolean; resume?: boolean; dryRun?: boolean; section?: string };

export type RunResult =
  | { kind: 'completed' }
  | { kind: 'killed' }
  | { kind: 'gate-failed'; decision: DispatchDecision }
  | { kind: 'dry-run'; decision: DispatchDecision; plan: unknown }
  | { kind: 'lock-contention'; message: string }
  | { kind: 'boundary-error'; message: string }
  | { kind: 'error'; message: string };

export async function runInner(
  name: string,
  opts: { resume?: boolean; dryRun?: boolean; section?: string },
): Promise<RunResult> {
  const orchDir = await findOrchestrationDir();
  const stateDir = await findStateDir();
  const storage = new FsStorage(stateDir);
  const orch = await loadOrchestration(orchDir, name);

  const contention = selectContentionDetector();
  const scope = { scope: 'orchestration' as const, orchestrationName: orch.name };

  if (opts.resume) {
    const execScope = { scope: 'execution' as const };
    let execLock;
    try {
      execLock = await acquireLock(storage, execScope);
    } catch (e) {
      if (e instanceof LockContentionError) return { kind: 'lock-contention', message: e.message };
      throw e;
    }
    try {
      let lock;
      try {
        lock = await acquireLock(storage, scope);
      } catch (e) {
        if (e instanceof LockContentionError) return { kind: 'lock-contention', message: e.message };
        throw e;
      }
      try {
        const humanInput = await selectHumanInputChannel(stateDir);
        const runner = new Runner({
          storage,
          agent: new ClaudeCodeAgent(),
          stateDir,
          contention,
          contentionThresholdMs: 30 * 60_000,
          lockScope: scope,
          ...(humanInput ? { humanInput } : {}),
        });
        activeRunners.set(orch.name, runner);
        try {
          await runner.resume({ orchestrationName: orch.name, plan: orch.plan });
          return { kind: 'completed' };
        } finally {
          activeRunners.delete(orch.name);
        }
      } catch (e) {
        if (e instanceof RunKilledError) return { kind: 'killed' };
        if (e instanceof BoundaryError) return { kind: 'boundary-error', message: e.message };
        return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
      } finally {
        await releaseLock(storage, scope, lock).catch(() => undefined);
      }
    } finally {
      await releaseLock(storage, execScope, execLock).catch(() => undefined);
    }
  }

  const quota = selectQuotaSource();
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

  if (!decision.shouldRun) return { kind: 'gate-failed', decision };
  if (opts.dryRun) return { kind: 'dry-run', decision, plan: orch.plan };

  const execScope = { scope: 'execution' as const };
  let execLock;
  try {
    execLock = await acquireLock(storage, execScope);
  } catch (e) {
    if (e instanceof LockContentionError) return { kind: 'lock-contention', message: e.message };
    throw e;
  }

  try {
    let lock;
    try {
      lock = await acquireLock(storage, scope);
    } catch (e) {
      if (e instanceof LockContentionError) return { kind: 'lock-contention', message: e.message };
      throw e;
    }

    try {
      const runner = new Runner({
        storage,
        agent: new ClaudeCodeAgent(),
        stateDir,
        contention,
        contentionThresholdMs: 30 * 60_000,
        lockScope: scope,
      });
      activeRunners.set(orch.name, runner);
      try {
        await runner.execute({
          orchestrationName: orch.name,
          workHash: orch.workHash,
          policyHash: orch.policyHash,
          executorHash: orch.executorHash,
          decision,
          plan: orch.plan,
        });
        return { kind: 'completed' };
      } finally {
        activeRunners.delete(orch.name);
      }
    } catch (e) {
      if (e instanceof RunKilledError) return { kind: 'killed' };
      if (e instanceof BoundaryError) return { kind: 'boundary-error', message: e.message };
      return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    } finally {
      await releaseLock(storage, scope, lock).catch(() => undefined);
    }
  } finally {
    await releaseLock(storage, execScope, execLock).catch(() => undefined);
  }
}

export async function runCommand(name: string, opts: RunOptions): Promise<number> {
  const result = await runInner(name, opts);
  switch (result.kind) {
    case 'completed':
      return 0;
    case 'killed':
      process.stderr.write('killed by user\n');
      return 130;
    case 'gate-failed':
      if (opts.json) process.stdout.write(JSON.stringify(result.decision));
      else process.stderr.write(`gate failed: ${result.decision.failedReasons.join(' ; ')}\n`);
      return 3;
    case 'dry-run':
      process.stdout.write(JSON.stringify({ decision: result.decision, plan: result.plan }));
      return 0;
    case 'lock-contention':
      process.stderr.write(`lock contention: ${result.message}\n`);
      return 4;
    case 'boundary-error':
      process.stderr.write(`boundary error: ${result.message}\n`);
      return 5;
    case 'error':
      process.stderr.write(`error: ${result.message}\n`);
      return 1;
  }
}
