import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Dispatcher } from '../../src/core/dispatcher.js';
import { FsStorage } from '../../src/adapters/storage/fs.js';
import { hashContent } from '../../src/lib/hashing.js';

const HASH = (s: string) => hashContent(s);

const baseInput = (root: string) => ({
  orchestrationName: 'demo',
  workHash: HASH('w'),
  policyHash: HASH('p'),
  executorHash: HASH('e'),
  riskClass: 'readonly' as const,
  storageRoot: root,
});

describe('Dispatcher', () => {
  it('emits policy_evaluated and dispatch_allowed when all gates pass', async () => {
    const root = await mkdtemp(join(tmpdir(), 'disp-'));
    const storage = new FsStorage(root);
    const d = new Dispatcher({
      storage,
      gates: {
        capacity: async () => ({ ok: true, reason: 'cap' }),
        contention: async () => ({ ok: true, reason: 'con' }),
        value: async () => ({ ok: true, reason: 'val' }),
        risk: async () => ({ ok: true, reason: 'rsk' }),
      },
    });
    const dec = await d.evaluate(baseInput(root));
    expect(dec.shouldRun).toBe(true);
    expect(dec.reasons).toEqual(['cap', 'con', 'val', 'rsk']);
    const events = await storage.readEvents();
    const names = events.map(e => e.name);
    expect(names).toContain('policy_evaluated');
    expect(names).toContain('dispatch_allowed');
  });

  it('emits dispatch_blocked with failedReasons when a gate fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'disp-'));
    const storage = new FsStorage(root);
    const d = new Dispatcher({
      storage,
      gates: {
        capacity: async () => ({ ok: true, reason: 'cap' }),
        contention: async () => ({ ok: true, reason: 'con' }),
        value: async () => ({ ok: false, reason: 'no value' }),
        risk: async () => ({ ok: true, reason: 'rsk' }),
      },
    });
    const dec = await d.evaluate(baseInput(root));
    expect(dec.shouldRun).toBe(false);
    expect(dec.failedReasons).toContain('no value');
    const events = await storage.readEvents();
    expect(events.map(e => e.name)).toContain('dispatch_blocked');
  });

  it('emits quota_insufficient when capacity fails with snapshot context', async () => {
    const root = await mkdtemp(join(tmpdir(), 'disp-'));
    const storage = new FsStorage(root);
    const d = new Dispatcher({
      storage,
      gates: {
        capacity: async () => ({
          ok: false,
          reason: 'enoughQuota(week): remaining 0.18 below threshold 0.25',
        }),
        contention: async () => ({ ok: true, reason: 'con' }),
        value: async () => ({ ok: true, reason: 'val' }),
        risk: async () => ({ ok: true, reason: 'rsk' }),
      },
      capacityContext: () => Promise.resolve([{ scope: 'week', remaining: 0.18, threshold: 0.25 }]),
    });
    await d.evaluate(baseInput(root));
    const events = await storage.readEvents();
    const qi = events.filter(e => e.name === 'quota_insufficient');
    expect(qi.length).toBe(1);
    expect(qi[0]!.payload).toMatchObject({ scope: 'week', remaining: 0.18, threshold: 0.25 });
  });
});
