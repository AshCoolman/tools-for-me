import { ClaudeCodeAgent } from '../adapters/agent/claude-code.js';
import { FsStorage } from '../adapters/storage/fs.js';
import { Dispatcher, type CapacityShortfall, type GateSet } from '../core/dispatcher.js';
import { acquireLock, LockContentionError, releaseLock } from '../core/locks.js';
import { enoughQuota } from '../core/predicates/capacity.js';
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
    for (const v of scan.valid) {
      if (stopping) return;
      try {
        await dispatchOne(orchDir, stateDir, storage, v.name);
      } catch (e) {
        process.stderr.write(
          `daemon: ${v.name}: ${e instanceof Error ? e.message : String(e)}\n`,
        );
      }
    }
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

  const policyCtx: PolicyContext = {
    orchestrationName: orch.name,
    workHash: orch.workHash,
    policyHash: orch.policyHash,
    executorHash: orch.executorHash,
    riskClass: orch.riskClass,
    workMd: orch.workMd,
    selectedSection: 'Objective',
    storage,
  };

  const gates: GateSet = {
    capacity: enoughQuota('week', quota),
    contention: noExternalActiveSessionsFor(30 * 60_000, contention),
    value: orch.policy(policyCtx),
    risk: safeRiskClass([...DEFAULT_ALLOWED], orch.riskClass),
  };

  const capacityContext = async (): Promise<CapacityShortfall[]> => {
    try {
      const snap = await quota.read();
      const out: CapacityShortfall[] = [];
      if (snap.week <= 0.25) out.push({ scope: 'week', remaining: snap.week, threshold: 0.25 });
      if (snap.session <= 0.25)
        out.push({ scope: 'session', remaining: snap.session, threshold: 0.25 });
      return out;
    } catch {
      return [];
    }
  };

  const dispatcher = new Dispatcher({ storage, gates, capacityContext });
  const decision = await dispatcher.evaluate({
    orchestrationName: orch.name,
    workHash: orch.workHash,
    policyHash: orch.policyHash,
    executorHash: orch.executorHash,
    riskClass: orch.riskClass,
    storageRoot: stateDir,
  });

  if (!decision.shouldRun) return;

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
}
