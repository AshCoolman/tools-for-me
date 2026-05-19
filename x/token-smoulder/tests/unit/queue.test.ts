import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadQueue,
  saveQueue,
  syncEntries,
  transitionState,
  disableEntry,
  enableEntry,
  evaluateGateProximity,
} from '../../src/core/queue.js';
import type { QueueEntry, QueueFile } from '../../src/core/types.js';

function makeEntry(name: string, overrides?: Partial<QueueEntry>): QueueEntry {
  return {
    name,
    enabled: true,
    lifecycle: 'once',
    queueState: 'pending',
    loopConfig: null,
    dailyRunCount: 0,
    lastCompletedAt: null,
    cooldownUntil: null,
    ...overrides,
  };
}

const defaultBudget = () => ({
  ceiling: 0.5,
  cycleDurationMs: 86_400_000,
  cycleStartedAt: null,
  snapshotAtCycleStart: null,
});

describe('queue state persistence', () => {
  it('loads empty queue from missing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'queue-'));
    const q = await loadQueue(dir);
    expect(q.entries).toEqual({});
  });

  it('round-trips through save and load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'queue-'));
    const queue: QueueFile = { entries: { foo: makeEntry('foo') }, budget: defaultBudget() };
    await saveQueue(dir, queue);
    const loaded = await loadQueue(dir);
    expect(loaded.entries['foo']!.name).toBe('foo');
    expect(loaded.entries['foo']!.queueState).toBe('pending');
  });
});

describe('syncEntries', () => {
  it('adds missing entries for discovered units', () => {
    const queue: QueueFile = { entries: { a: makeEntry('a') }, budget: defaultBudget() };
    const synced = syncEntries(queue, ['a', 'b', 'c']);
    expect(Object.keys(synced.entries)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('preserves state of existing entries', () => {
    const queue: QueueFile = {
      entries: { a: makeEntry('a', { queueState: 'done' }) },
      budget: defaultBudget(),
    };
    const synced = syncEntries(queue, ['a', 'b']);
    expect(synced.entries['a']!.queueState).toBe('done');
    expect(synced.entries['b']!.queueState).toBe('pending');
  });
});

describe('transitionState', () => {
  it('transitions pending → running', () => {
    const entry = makeEntry('x');
    const result = transitionState(entry, 'running');
    expect(result.queueState).toBe('running');
  });

  it('transitions running → done', () => {
    const entry = makeEntry('x', { queueState: 'running' });
    const result = transitionState(entry, 'done');
    expect(result.queueState).toBe('done');
  });

  it('transitions done → pending (work hash change)', () => {
    const entry = makeEntry('x', { queueState: 'done' });
    const result = transitionState(entry, 'pending');
    expect(result.queueState).toBe('pending');
  });

  it('transitions cooldown → pending', () => {
    const entry = makeEntry('x', { queueState: 'cooldown' });
    const result = transitionState(entry, 'pending');
    expect(result.queueState).toBe('pending');
  });

  it('rejects invalid transitions', () => {
    const entry = makeEntry('x', { queueState: 'pending' });
    expect(() => transitionState(entry, 'done')).toThrow('invalid queue transition');
  });
});

describe('disable/enable', () => {
  it('disableEntry transitions to disabled', () => {
    const entry = makeEntry('x');
    const { entry: disabled, priorState } = disableEntry(entry);
    expect(disabled.queueState).toBe('disabled');
    expect(priorState).toBe('pending');
  });

  it('enableEntry restores prior state', () => {
    const disabled = makeEntry('x', { queueState: 'disabled' });
    const result = enableEntry(disabled, 'done');
    expect(result.queueState).toBe('done');
  });

  it('daemon skips disabled units', () => {
    const entries = [
      makeEntry('a', { queueState: 'pending' }),
      makeEntry('b', { queueState: 'disabled', enabled: false }),
      makeEntry('c', { queueState: 'pending' }),
    ];
    const enabled = entries.filter(e => e.enabled && e.queueState === 'pending');
    expect(enabled.map(e => e.name)).toEqual(['a', 'c']);
  });
});

describe('evaluateGateProximity', () => {
  it('sorts by passing count descending and assigns positions', () => {
    const entries = [
      makeEntry('a'),
      makeEntry('b'),
      makeEntry('c'),
    ];
    const gateResults = new Map([
      ['a', { passing: 2, blocking: ['contention', 'capacity'] }],
      ['b', { passing: 4, blocking: [] }],
      ['c', { passing: 3, blocking: ['contention'] }],
    ]);
    const result = evaluateGateProximity(entries, gateResults);
    expect(result[0]!.name).toBe('b');
    expect(result[0]!.position).toBe(1);
    expect(result[1]!.name).toBe('c');
    expect(result[1]!.position).toBe(2);
    expect(result[2]!.name).toBe('a');
    expect(result[2]!.position).toBe(3);
  });

  it('excludes disabled and non-pending entries', () => {
    const entries = [
      makeEntry('a', { queueState: 'pending' }),
      makeEntry('b', { queueState: 'done' }),
      makeEntry('c', { queueState: 'pending', enabled: false }),
    ];
    const gateResults = new Map([
      ['a', { passing: 2, blocking: [] }],
    ]);
    const result = evaluateGateProximity(entries, gateResults);
    expect(result.length).toBe(1);
    expect(result[0]!.name).toBe('a');
  });
});
