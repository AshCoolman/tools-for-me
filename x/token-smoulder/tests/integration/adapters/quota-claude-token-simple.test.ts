import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeTokenSimpleQuota } from '../../../src/adapters/quota/claude-token-simple.js';
import { BoundaryError } from '../../../src/lib/errors.js';

const writeBin = async (dir: string, name: string, body: string) => {
  const p = join(dir, name);
  await writeFile(p, body);
  await chmod(p, 0o755);
  return p;
};

describe('ClaudeTokenSimpleQuota', () => {
  it('parses a known JSON shape into a QuotaSnapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'q-'));
    await writeBin(
      dir,
      'claude-token-simple',
      `#!/usr/bin/env bash
echo '{"session": 0.9, "week": 0.6}'
`,
    );
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` };
    const q = new ClaudeTokenSimpleQuota({ env });
    const snap = await q.read();
    expect(snap.session).toBe(0.9);
    expect(snap.week).toBe(0.6);
    expect(snap.source).toBe('claude-token-simple');
    expect(typeof snap.sampledAt).toBe('string');
  });

  it('throws BoundaryError on non-zero exit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'q-'));
    await writeBin(dir, 'claude-token-simple', `#!/usr/bin/env bash\nexit 2\n`);
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` };
    const q = new ClaudeTokenSimpleQuota({ env });
    await expect(q.read()).rejects.toThrow(BoundaryError);
  });

  it('throws BoundaryError on malformed output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'q-'));
    await writeBin(dir, 'claude-token-simple', `#!/usr/bin/env bash\necho 'not json'\n`);
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` };
    const q = new ClaudeTokenSimpleQuota({ env });
    await expect(q.read()).rejects.toThrow(BoundaryError);
  });
});
