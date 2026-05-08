import { describe, expect, it } from 'vitest';
import { queuedWorkExists } from '../../../src/core/predicates/value.js';

const makeStorage = (): {
  loadLatestRun: () => Promise<null>;
} => ({
  loadLatestRun: async () => null,
});

describe('queuedWorkExists', () => {
  it('returns true when the selected section is non-empty', async () => {
    const r = await queuedWorkExists({
      orchestrationName: 'x',
      workMd: '# Objective\n\nDo a thing\n',
      workHash: 'a'.repeat(64),
      selectedSection: 'Objective',
      storage: makeStorage(),
    })();
    expect(r.ok).toBe(true);
  });

  it('returns false when the selected section is empty', async () => {
    const r = await queuedWorkExists({
      orchestrationName: 'x',
      workMd: '# Objective\n\n   \n',
      workHash: 'a'.repeat(64),
      selectedSection: 'Objective',
      storage: makeStorage(),
    })();
    expect(r.ok).toBe(false);
  });

  it('returns false when current workHash matches the latest completed run', async () => {
    const r = await queuedWorkExists({
      orchestrationName: 'x',
      workMd: '# Objective\n\nbody\n',
      workHash: 'b'.repeat(64),
      selectedSection: 'Objective',
      storage: {
        loadLatestRun: async () =>
          ({
            workHash: 'b'.repeat(64),
            status: 'completed',
          }) as never,
      },
    })();
    expect(r.ok).toBe(false);
  });
});
