import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsStorage } from '../../../src/adapters/storage/fs.js';
import { runDaemonTick } from '../../../src/cli/daemon.js';

describe('daemon tick overrun', () => {
  it('emits tick_overran when tick duration exceeds threshold', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tick-'));
    const storage = new FsStorage(root);

    let calls = 0;
    const now = () => {
      const v = 1000 + calls * 31_000;
      calls++;
      return v;
    };

    await runDaemonTick({
      storage,
      doTick: async () => {},
      now,
      overrunMs: 30_000,
    });

    const events = await storage.readEvents();
    const overran = events.find(e => e.name === 'tick_overran');
    expect(overran).toBeDefined();
    expect(overran?.payload).toMatchObject({ durationMs: 31_000 });
  });

  it('does not emit tick_overran when tick is under threshold', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tick-'));
    const storage = new FsStorage(root);

    let calls = 0;
    const now = () => {
      const v = 1000 + calls * 1_000;
      calls++;
      return v;
    };

    await runDaemonTick({
      storage,
      doTick: async () => {},
      now,
      overrunMs: 30_000,
    });

    const events = await storage.readEvents();
    expect(events.find(e => e.name === 'tick_overran')).toBeUndefined();
  });
});
