import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Dispatcher } from '../../src/core/dispatcher.js';
import { FsStorage } from '../../src/adapters/storage/fs.js';
import { hashContent } from '../../src/lib/hashing.js';

const HASH = (s: string) => hashContent(s);

const baseInput = (root: string) => ({
  orchestrationName: 'test-unit',
  workHash: HASH('w'),
  policyHash: HASH('p'),
  executorHash: HASH('e'),
  riskClass: 'readonly' as const,
  storageRoot: root,
});

describe('force-run dispatch', () => {
  it('bypasses gates when force=true', async () => {
    const root = await mkdtemp(join(tmpdir(), 'force-'));
    const storage = new FsStorage(root);
    const d = new Dispatcher({
      storage,
      gates: {
        capacity: async () => ({ ok: false, reason: 'no capacity' }),
        contention: async () => ({ ok: false, reason: 'contention active' }),
        value: async () => ({ ok: false, reason: 'no value' }),
        risk: async () => ({ ok: false, reason: 'too risky' }),
      },
    });
    const dec = await d.evaluate({ ...baseInput(root), force: true });
    expect(dec.shouldRun).toBe(true);
    expect(dec.reasons).toEqual(['force:manual-override']);
    expect(dec.failedReasons).toEqual([]);
  });

  it('records force:manual-override in events', async () => {
    const root = await mkdtemp(join(tmpdir(), 'force-'));
    const storage = new FsStorage(root);
    const d = new Dispatcher({
      storage,
      gates: {
        capacity: async () => ({ ok: false, reason: 'no cap' }),
        contention: async () => ({ ok: false, reason: 'busy' }),
        value: async () => ({ ok: false, reason: 'no val' }),
        risk: async () => ({ ok: false, reason: 'risky' }),
      },
    });
    await d.evaluate({ ...baseInput(root), force: true });
    const events = await storage.readEvents();
    const allowed = events.find(e => e.name === 'dispatch_allowed');
    expect(allowed).toBeDefined();
    expect(allowed!.payload).toHaveProperty('forced', true);
    expect(allowed!.payload).toHaveProperty('reasons');
    expect((allowed!.payload as { reasons: string[] }).reasons).toContain('force:manual-override');
  });

  it('still blocks when suppression is active', async () => {
    const root = await mkdtemp(join(tmpdir(), 'force-'));
    const storage = new FsStorage(root);
    await storage.saveSuppression({
      key: HASH('suppkey'),
      orchestrationName: 'test-unit',
      workHash: HASH('w'),
      policyHash: HASH('p'),
      executorHash: HASH('e'),
      failingPromptIndex: 0,
      failureSignature: 'test failure',
      firstSeenAt: new Date().toISOString(),
      count: 2,
      reason: 'second identical failure',
    });
    const d = new Dispatcher({
      storage,
      gates: {
        capacity: async () => ({ ok: true, reason: 'cap' }),
        contention: async () => ({ ok: true, reason: 'con' }),
        value: async () => ({ ok: true, reason: 'val' }),
        risk: async () => ({ ok: true, reason: 'rsk' }),
      },
    });
    const dec = await d.evaluate({ ...baseInput(root), force: true });
    expect(dec.shouldRun).toBe(false);
    expect(dec.failedReasons[0]).toContain('run_suppressed');
  });

  it('evaluates gates normally when force is not set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'force-'));
    const storage = new FsStorage(root);
    const d = new Dispatcher({
      storage,
      gates: {
        capacity: async () => ({ ok: false, reason: 'no capacity' }),
        contention: async () => ({ ok: true, reason: 'con' }),
        value: async () => ({ ok: true, reason: 'val' }),
        risk: async () => ({ ok: true, reason: 'rsk' }),
      },
    });
    const dec = await d.evaluate(baseInput(root));
    expect(dec.shouldRun).toBe(false);
    expect(dec.failedReasons).toContain('no capacity');
  });
});
