import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsStorage } from '../../../src/adapters/storage/fs.js';
import { hashContent } from '../../../src/lib/hashing.js';
import type { RunRecord } from '../../../src/adapters/storage/internal-types.js';

const fixedRun = (over: Partial<RunRecord> = {}): RunRecord => ({
  runId: '01HXAAAA',
  orchestrationName: 'demo',
  status: 'completed',
  riskClass: 'readonly',
  workHash: hashContent('w'),
  policyHash: hashContent('p'),
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
  ...over,
});

describe('FsStorage', () => {
  it('appendEvent is append-only and readEvents returns ordered events', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fs-'));
    const s = new FsStorage(root);
    await s.appendEvent({ name: 'orchestration_discovered', timestamp: '2026-05-06T00:00:00Z' });
    await s.appendEvent({ name: 'policy_evaluated', timestamp: '2026-05-06T00:00:01Z' });
    const ev = await s.readEvents();
    expect(ev.map(e => e.name)).toEqual(['orchestration_discovered', 'policy_evaluated']);

    const ndjson = await readFile(join(root, 'events.ndjson'), 'utf8');
    expect(ndjson.split('\n').filter(Boolean).length).toBe(2);
  });

  it('saveRun + loadLatestRun round-trips', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fs-'));
    const s = new FsStorage(root);
    const r = fixedRun();
    await s.saveRun(r);
    const back = await s.loadLatestRun('demo');
    expect(back?.runId).toBe(r.runId);
  });

  it('acquireLock throws on contention', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fs-'));
    const s = new FsStorage(root);
    await s.acquireLock({ scope: 'orchestration', orchestrationName: 'demo' }, 'scheduler');
    await expect(
      s.acquireLock({ scope: 'orchestration', orchestrationName: 'demo' }, 'scheduler'),
    ).rejects.toThrow();
  });

  it('releaseLock allows re-acquire', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fs-'));
    const s = new FsStorage(root);
    await s.acquireLock({ scope: 'orchestration', orchestrationName: 'demo' }, 'scheduler');
    await s.releaseLock({ scope: 'orchestration', orchestrationName: 'demo' });
    await expect(
      s.acquireLock({ scope: 'orchestration', orchestrationName: 'demo' }, 'scheduler'),
    ).resolves.toBeDefined();
  });

  it('listActiveSuppressions returns [] when no records exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fs-'));
    const s = new FsStorage(root);
    const records = await s.listActiveSuppressions();
    expect(records).toEqual([]);
  });
});
