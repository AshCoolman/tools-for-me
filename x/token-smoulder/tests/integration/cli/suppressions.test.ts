import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsStorage } from '../../../src/adapters/storage/fs.js';
import { recordFailure } from '../../../src/core/suppression.js';
import { hashContent } from '../../../src/lib/hashing.js';

const exec = promisify(execFile);

const BIN = join(process.cwd(), 'bin', 'token-smoulder');

const baseEnv = (stateDir: string) => ({
  ...process.env,
  TOKEN_SMOULDER_STATE_DIR: stateDir,
});

const HASH = (s: string) => hashContent(s);

const seedActive = async (stateDir: string): Promise<string> => {
  const storage = new FsStorage(stateDir);
  const input = {
    orchestrationName: 'demo',
    workHash: HASH('w'),
    policyHash: HASH('p'),
    executorHash: HASH('e'),
    failingPromptIndex: 0,
    failureSignature: 'oops',
  };
  await recordFailure(storage, input);
  const rec = await recordFailure(storage, input);
  return rec.key;
};

describe('CLI suppressions / clear-suppression', () => {
  it('lists active suppressions', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'sup-'));
    const key = await seedActive(stateDir);

    const { stdout } = await exec(BIN, ['suppressions'], { env: baseEnv(stateDir) });
    const parsed = JSON.parse(stdout) as Array<{ key: string; count: number }>;
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.key).toBe(key);
    expect(parsed[0]!.count).toBe(2);
  });

  it('clear-suppression removes the active record', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'sup-'));
    const key = await seedActive(stateDir);

    await exec(BIN, ['clear-suppression', key], { env: baseEnv(stateDir) });

    const { stdout } = await exec(BIN, ['suppressions'], { env: baseEnv(stateDir) });
    const parsed = JSON.parse(stdout) as Array<unknown>;
    expect(parsed.length).toBe(0);
  });
});
