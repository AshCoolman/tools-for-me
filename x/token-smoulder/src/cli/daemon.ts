import { ClaudeCodeAgent } from '../adapters/agent/claude-code.js';
import { FsStorage } from '../adapters/storage/fs.js';
import { Dispatcher, type GateSet } from '../core/dispatcher.js';
import { acquireLock, LockContentionError, releaseLock } from '../core/locks.js';
import { assertQuotaGateUsed } from '../core/predicates/capacity.js';
import { noExternalActiveSessionsFor } from '../core/predicates/contention.js';
import { safeRiskClass } from '../core/predicates/risk.js';
import { Runner } from '../core/runner.js';
import { env } from '../lib/env.js';
import {
  findOrchestrationDir,
  findStateDir,
  loadOrchestration,
  scanOrchestrations,
} from './orchestration.js';
import { selectContentionDetector, selectHumanInputChannel, selectQuotaSource } from './wiring.js';
import { loadQueue, saveQueue, syncEntries, transitionState } from '../core/queue.js';
import { checkBudget } from '../core/budget.js';
import type { Storage, LockScope } from '../adapters/storage/interface.js';
import type { PolicyContext } from '../core/predicates/compose.js';

const DEFAULT_ALLOWED = ['readonly', 'repo-local'] as const;

export type DaemonOptions = {
  tick?: number;
  globalLock: boolean;
};

export type DaemonTickDeps = {
  storage: Storage;
  doTick: () => Promise<void>;
  now: () => number;
  overrunMs: number;
};

export async function runDaemonTick(deps: DaemonTickDeps): Promise<void> {
  const start = deps.now();
  await deps.doTick();
  const durationMs = deps.now() - start;
  if (durationMs > deps.overrunMs) {
    await deps.storage.appendEvent({
      name: 'tick_overran',
      timestamp: new Date().toISOString(),
      payload: { durationMs },
    });
  }
}

export async function daemonCommand(opts: DaemonOptions): Promise<number> {
  let stopping = false;
  let inFlight: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;
  let resolveExit: () => void = () => undefined;
  const exitPromise = new Promise<void>(resolve => {
    resolveExit = resolve;
  });

  const earlySignal = (): void => {
    stopping = true;
    resolveExit();
  };
  process.on('SIGINT', earlySignal);
  process.on('SIGTERM', earlySignal);

  const orchDir = await findOrchestrationDir();
  const stateDir = await findStateDir();
  const storage = new FsStorage(stateDir);
  const tickMs = opts.tick ?? env.tickMs();
  const overrunMs = env.tickOverrunMs();
  const graceMs = env.shutdownGraceMs();

  let globalLock: LockScope | null = null;
  if (opts.globalLock) {
    try {
      await acquireLock(storage, { scope: 'global' });
      globalLock = { scope: 'global' };
    } catch (e) {
      if (e instanceof LockContentionError) {
        process.stderr.write(`daemon: global lock contention: ${e.message}\n`);
        return 4;
      }
      throw e;
    }
  }

  const doTick = async (): Promise<void> => {
    if (stopping) return;
    const scan = await scanOrchestrations(orchDir);
    let queue = await loadQueue(stateDir);
    queue = syncEntries(queue, scan.valid.map(v => v.name));

    const quota = selectQuotaSource();
    const { budget: updatedBudget, status: budgetStatus } = await checkBudget(queue.budget, quota, Date.now());
    queue = { ...queue, budget: updatedBudget };

    // Pass 1: Housekeeping — done→pending (work hash change), cooldown→pending
    for (const v of scan.valid) {
      if (stopping) return;
      const entry = queue.entries[v.name];
      if (!entry || !entry.enabled) continue;
      if (entry.queueState === 'done') {
        try {
          const orch = await loadOrchestration(orchDir, v.name);
          if (entry.lastWorkHash && orch.workHash !== entry.lastWorkHash) {
            queue.entries[v.name] = transitionState(entry, 'pending');
          }
        } catch { /* skip unloadable */ }
      } else if (entry.queueState === 'cooldown') {
        if (entry.cooldownUntil && Date.now() >= Date.parse(entry.cooldownUntil)) {
          if (entry.loopConfig && entry.dailyRunCount < entry.loopConfig.maxRunsPerDay) {
            queue.entries[v.name] = transitionState(entry, 'pending', { cooldownUntil: null });
          }
        }
      }
    }

    // Pass 2: Evaluate gates for pending units and compute proximity
    const pendingUnits = scan.valid.filter(v => {
      const e = queue.entries[v.name];
      return e && e.enabled && e.queueState === 'pending';
    });

    const gateResults = new Map<string, { passing: number; blocking: string[] }>();
    for (const v of pendingUnits) {
      if (stopping) return;
      try {
        const orch = await loadOrchestration(orchDir, v.name);
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
        const gates: GateSet = {
          capacity: async () => ({ ok: true, reason: 'pass: capacity delegated to policy' }),
          contention: noExternalActiveSessionsFor(30 * 60_000, contention),
          value: valueGate,
          risk: safeRiskClass([...DEFAULT_ALLOWED], orch.riskClass),
        };
        const gateNames: Array<[string, () => Promise<{ ok: boolean; reason: string }>]> = [
          ['capacity', gates.capacity], ['contention', gates.contention],
          ['value', gates.value], ['risk', gates.risk],
        ];
        let passing = 0;
        const blocking: string[] = [];
        for (const [gn, gf] of gateNames) {
          const r = await gf();
          if (r.ok) passing++;
          else blocking.push(gn);
        }
        gateResults.set(v.name, { passing, blocking });
      } catch {
        gateResults.set(v.name, { passing: 0, blocking: ['error'] });
      }
    }

    // Sort by proximity (most passing gates first)
    const sorted = [...pendingUnits].sort((a, b) => {
      const pa = gateResults.get(a.name)?.passing ?? 0;
      const pb = gateResults.get(b.name)?.passing ?? 0;
      if (pb !== pa) return pb - pa;
      return a.name.localeCompare(b.name);
    });

    // Pass 3: Dispatch highest-proximity unit (serial — 1 at a time)
    if (!stopping && !budgetStatus.exhausted && sorted.length > 0) {
      const top = sorted[0]!;
      const gr = gateResults.get(top.name);
      if (gr && gr.blocking.length === 0) {
        const entry = queue.entries[top.name]!;
        try {
          const orch = await loadOrchestration(orchDir, top.name);
          queue.entries[top.name] = transitionState(entry, 'running');
          await saveQueue(stateDir, queue);
          await dispatchOne(orchDir, stateDir, storage, top.name);
          const now = new Date().toISOString();
          const updated = queue.entries[top.name]!;
          if (updated.lifecycle === 'loop' && updated.loopConfig) {
            queue.entries[top.name] = {
              ...transitionState(updated, 'cooldown', {
                lastCompletedAt: now,
                dailyRunCount: updated.dailyRunCount + 1,
                cooldownUntil: new Date(Date.now() + updated.loopConfig.cooldownMs).toISOString(),
              }),
              lastWorkHash: orch.workHash,
            };
          } else {
            queue.entries[top.name] = {
              ...transitionState(updated, 'done', {
                lastCompletedAt: now,
                dailyRunCount: updated.dailyRunCount + 1,
              }),
              lastWorkHash: orch.workHash,
            };
          }
        } catch (e) {
          const updated = queue.entries[top.name]!;
          queue.entries[top.name] = transitionState(updated, 'failed');
          process.stderr.write(
            `daemon: ${top.name}: ${e instanceof Error ? e.message : String(e)}\n`,
          );
        }
      }
    } else if (budgetStatus.exhausted && pendingUnits.length > 0) {
      await storage.appendEvent({
        name: 'budget_exhausted',
        timestamp: new Date().toISOString(),
        payload: { ceiling: budgetStatus.ceiling, consumed: budgetStatus.consumed },
      });
    }

    await saveQueue(stateDir, queue);
  };

  const tick = async (): Promise<void> => {
    inFlight = runDaemonTick({ storage, doTick, now: () => Date.now(), overrunMs });
    await inFlight;
  };

  const shutdown = async (): Promise<void> => {
    if (stopping) {
      // Already torn down by earlySignal; still wait for any in-flight + release lock.
    } else {
      stopping = true;
    }
    if (timer) clearInterval(timer);
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline) {
      const finished = await Promise.race([
        inFlight.then(() => true),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 250)),
      ]);
      if (finished) break;
    }
    if (globalLock) await releaseLock(storage, globalLock).catch(() => undefined);
    resolveExit();
  };

  process.removeListener('SIGINT', earlySignal);
  process.removeListener('SIGTERM', earlySignal);
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // If a SIGINT arrived between earlySignal removal and full handler attach,
  // earlySignal already set stopping/resolveExit, so the remaining flow short-circuits.
  if (stopping) {
    if (globalLock) await releaseLock(storage, globalLock).catch(() => undefined);
    return 0;
  }

  await tick();
  if (!stopping) {
    timer = setInterval(() => {
      if (!stopping) void tick();
    }, tickMs);
  }
  await exitPromise;
  await inFlight.catch(() => undefined);
  if (timer) clearInterval(timer);
  return 0;
}

async function dispatchOne(
  orchDir: string,
  stateDir: string,
  storage: Storage,
  name: string,
): Promise<void> {
  const orch = await loadOrchestration(orchDir, name);
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
    selectedSection: 'Objective',
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

  if (!decision.shouldRun) return;

  const execScope: LockScope = { scope: 'execution' };
  let execLock;
  try {
    execLock = await acquireLock(storage, execScope);
  } catch (e) {
    if (e instanceof LockContentionError) return;
    throw e;
  }

  try {
    const scope: LockScope = { scope: 'orchestration', orchestrationName: orch.name };
    let lock;
    try {
      lock = await acquireLock(storage, scope);
    } catch (e) {
      if (e instanceof LockContentionError) return;
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
      await runner.execute({
        orchestrationName: orch.name,
        workHash: orch.workHash,
        policyHash: orch.policyHash,
        executorHash: orch.executorHash,
        decision,
        plan: orch.plan,
      });
    } finally {
      await releaseLock(storage, scope, lock).catch(() => undefined);
    }
  } finally {
    await releaseLock(storage, execScope, execLock).catch(() => undefined);
  }
}
