import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Dispatcher } from '../../src/core/dispatcher.js';
import { FsStorage } from '../../src/adapters/storage/fs.js';
import { hashContent } from '../../src/lib/hashing.js';
import type { RunRecord } from '../../src/adapters/storage/internal-types.js';

describe('Dispatcher policy change detection', () => {
  it('emits policy_changed before policy_evaluated when policyHash differs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pc-'));
    const storage = new FsStorage(root);

    const previousHash = hashContent('old policy');
    const currentHash = hashContent('new policy');
    const previous: RunRecord = {
      runId: '01HX',
      orchestrationName: 'demo',
      status: 'completed',
      riskClass: 'readonly',
      workHash: hashContent('w'),
      policyHash: previousHash,
      executorHash: hashContent('e'),
      startedAt: '2026-05-06T00:00:00Z',
      steps: [],
      decision: {
        shouldRun: true,
        orchestrationName: 'demo',
        reasons: [],
        failedReasons: [],
        riskClass: 'readonly',
        selectedWorkHash: hashContent('w'),
        evaluatedAt: '2026-05-06T00:00:00Z',
      },
    };
    await storage.saveRun(previous);

    const d = new Dispatcher({
      storage,
      gates: {
        capacity: async () => ({ ok: true, reason: 'cap' }),
        contention: async () => ({ ok: true, reason: 'con' }),
        value: async () => ({ ok: true, reason: 'val' }),
        risk: async () => ({ ok: true, reason: 'rsk' }),
      },
    });

    await d.evaluate({
      orchestrationName: 'demo',
      workHash: hashContent('w'),
      policyHash: currentHash,
      executorHash: hashContent('e'),
      riskClass: 'readonly',
      storageRoot: root,
    });

    const events = await storage.readEvents();
    const names = events.map(e => e.name);
    const pcIdx = names.indexOf('policy_changed');
    const peIdx = names.indexOf('policy_evaluated');
    expect(pcIdx).toBeGreaterThanOrEqual(0);
    expect(peIdx).toBeGreaterThan(pcIdx);
    expect(events[pcIdx]!.payload).toMatchObject({ previousHash, currentHash });
  });
});
