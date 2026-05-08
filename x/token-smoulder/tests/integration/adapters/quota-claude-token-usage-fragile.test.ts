import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeTokenUsageFragileQuota } from '../../../src/adapters/quota/claude-token-usage-fragile.js';
import { BoundaryError } from '../../../src/lib/errors.js';

const writeBin = async (dir: string, name: string, body: string) => {
  const p = join(dir, name);
  await writeFile(p, body);
  await chmod(p, 0o755);
  return p;
};

describe('ClaudeTokenUsageFragileQuota', () => {
  it('parses session/week from the fragile JSON shape', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qf-'));
    await writeBin(
      dir,
      'claude-token-usage-fragile',
      `#!/usr/bin/env bash
echo '{"sessionRemainingFraction": 0.42, "weekRemainingFraction": 0.71}'
`,
    );
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` };
    const q = new ClaudeTokenUsageFragileQuota({ env });
    const snap = await q.read();
    expect(snap.session).toBe(0.42);
    expect(snap.week).toBe(0.71);
    expect(snap.source).toBe('claude-token-usage-fragile');
  });

  it('throws BoundaryError on non-zero exit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qf-'));
    await writeBin(dir, 'claude-token-usage-fragile', `#!/usr/bin/env bash\nexit 5\n`);
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` };
    const q = new ClaudeTokenUsageFragileQuota({ env });
    await expect(q.read()).rejects.toThrow(BoundaryError);
  });
});
