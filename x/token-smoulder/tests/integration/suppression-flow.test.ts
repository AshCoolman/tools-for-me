import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsStorage } from '../../src/adapters/storage/fs.js';
import { Dispatcher } from '../../src/core/dispatcher.js';
import { recordFailure, findActive } from '../../src/core/suppression.js';
import { hashContent } from '../../src/lib/hashing.js';

const HASH = (s: string) => hashContent(s);

const baseDispatchInput = () => ({
  orchestrationName: 'demo',
  workHash: HASH('w'),
  policyHash: HASH('p'),
  executorHash: HASH('e'),
  riskClass: 'readonly' as const,
});

const allPass = () => ({
  capacity: async () => ({ ok: true as const, reason: 'cap' }),
  contention: async () => ({ ok: true as const, reason: 'con' }),
  value: async () => ({ ok: true as const, reason: 'val' }),
  risk: async () => ({ ok: true as const, reason: 'rsk' }),
});

describe('Suppression flow', () => {
  it('records first failure (count=1) without activating', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sup-'));
    const storage = new FsStorage(root);

    await recordFailure(storage, {
      orchestrationName: 'demo',
      workHash: HASH('w'),
      policyHash: HASH('p'),
      executorHash: HASH('e'),
      failingPromptIndex: 1,
      failureSignature: 'oops',
    });

    const active = await findActive(storage, {
      orchestrationName: 'demo',
      workHash: HASH('w'),
      policyHash: HASH('p'),
      executorHash: HASH('e'),
    });
    expect(active).toBeNull();
    const all = await storage.listActiveSuppressions();
    expect(all.length).toBe(0);
  });

  it('activates suppression after second identical failure and blocks dispatch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sup-'));
    const storage = new FsStorage(root);

    const failureInput = {
      orchestrationName: 'demo',
      workHash: HASH('w'),
      policyHash: HASH('p'),
      executorHash: HASH('e'),
      failingPromptIndex: 1,
      failureSignature: 'oops',
    };

    await recordFailure(storage, failureInput);
    await recordFailure(storage, failureInput);

    const active = await findActive(storage, {
      orchestrationName: failureInput.orchestrationName,
      workHash: failureInput.workHash,
      policyHash: failureInput.policyHash,
      executorHash: failureInput.executorHash,
    });
    expect(active).not.toBeNull();
    expect(active?.count).toBe(2);

    const dispatcher = new Dispatcher({ storage, gates: allPass() });
    const decision = await dispatcher.evaluate({
      ...baseDispatchInput(),
      storageRoot: root,
    });
    expect(decision.shouldRun).toBe(false);
    expect(decision.failedReasons.some(r => r.includes('suppress'))).toBe(true);

    const events = await storage.readEvents();
    expect(events.map(e => e.name)).toContain('run_suppressed');
  });

  it('clearSuppression unblocks subsequent dispatch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sup-'));
    const storage = new FsStorage(root);

    const failureInput = {
      orchestrationName: 'demo',
      workHash: HASH('w'),
      policyHash: HASH('p'),
      executorHash: HASH('e'),
      failingPromptIndex: 1,
      failureSignature: 'oops',
    };
    await recordFailure(storage, failureInput);
    await recordFailure(storage, failureInput);

    const list = await storage.listActiveSuppressions();
    expect(list.length).toBe(1);
    await storage.clearSuppression(list[0]!.key);

    const after = await findActive(storage, {
      orchestrationName: failureInput.orchestrationName,
      workHash: failureInput.workHash,
      policyHash: failureInput.policyHash,
      executorHash: failureInput.executorHash,
    });
    expect(after).toBeNull();

    const dispatcher = new Dispatcher({ storage, gates: allPass() });
    const decision = await dispatcher.evaluate({
      ...baseDispatchInput(),
      storageRoot: root,
    });
    expect(decision.shouldRun).toBe(true);
  });
});
