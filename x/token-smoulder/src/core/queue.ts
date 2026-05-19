import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '../lib/env.js';
import type { QueueEntry, QueueFile, QueueState, DailyBudget } from './types.js';
import { QueueFileSchema } from './types.js';

function defaultBudget(): DailyBudget {
  return {
    ceiling: env.budgetCeiling(),
    cycleDurationMs: env.cycleDurationMs(),
    cycleStartedAt: null,
    snapshotAtCycleStart: null,
  };
}

function defaultEntry(name: string): QueueEntry {
  return {
    name,
    enabled: true,
    lifecycle: 'once',
    queueState: 'pending',
    loopConfig: null,
    dailyRunCount: 0,
    lastCompletedAt: null,
    cooldownUntil: null,
  };
}

export async function loadQueue(stateDir: string): Promise<QueueFile> {
  const path = join(stateDir, 'queue.json');
  try {
    const raw = await readFile(path, 'utf8');
    return QueueFileSchema.parse(JSON.parse(raw));
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { entries: {}, budget: defaultBudget() };
    }
    throw e;
  }
}

export async function saveQueue(stateDir: string, queue: QueueFile): Promise<void> {
  const path = join(stateDir, 'queue.json');
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(queue, null, 2), 'utf8');
  await rename(tmp, path);
}

export function syncEntries(queue: QueueFile, discoveredNames: string[]): QueueFile {
  const entries = { ...queue.entries };
  for (const name of discoveredNames) {
    if (!entries[name]) {
      entries[name] = defaultEntry(name);
    }
  }
  return { ...queue, entries };
}

const VALID_TRANSITIONS: Record<QueueState, QueueState[]> = {
  pending: ['running', 'disabled'],
  running: ['done', 'cooldown', 'failed', 'disabled'],
  done: ['pending', 'disabled'],
  cooldown: ['pending', 'disabled'],
  failed: ['pending', 'suppressed', 'disabled'],
  suppressed: ['pending', 'disabled'],
  disabled: ['pending', 'done', 'cooldown', 'failed', 'suppressed', 'running'],
};

export function transitionState(
  entry: QueueEntry,
  to: QueueState,
  patch?: Partial<Pick<QueueEntry, 'cooldownUntil' | 'lastCompletedAt' | 'dailyRunCount'>>,
): QueueEntry {
  const from = entry.queueState;
  if (from === to) return entry;
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`invalid queue transition: ${from} → ${to}`);
  }
  return { ...entry, queueState: to, ...patch };
}

export function disableEntry(entry: QueueEntry): { entry: QueueEntry; priorState: QueueState } {
  const priorState = entry.queueState;
  return { entry: transitionState(entry, 'disabled'), priorState };
}

export function enableEntry(entry: QueueEntry, priorState: QueueState): QueueEntry {
  return transitionState(entry, priorState === 'disabled' ? 'pending' : priorState);
}

export function evaluateGateProximity(
  entries: QueueEntry[],
  gateResults: Map<string, { passing: number; blocking: string[] }>,
): Array<{ name: string; passing: number; blocking: string[]; position: number | null }> {
  const enabled = entries.filter(e => e.enabled && e.queueState === 'pending');
  const scored = enabled.map(e => {
    const result = gateResults.get(e.name) ?? { passing: 0, blocking: [] };
    return { name: e.name, passing: result.passing, blocking: result.blocking };
  });
  scored.sort((a, b) => b.passing - a.passing || a.name.localeCompare(b.name));
  return scored.map((s, i) => ({
    ...s,
    position: i + 1,
  }));
}
