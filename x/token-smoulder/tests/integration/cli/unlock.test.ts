import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

const BIN = join(process.cwd(), 'bin', 'token-smoulder');
const FIX = join(process.cwd(), 'tests', 'fixtures', 'orchestration');

const baseEnv = (stateDir: string) => ({
  ...process.env,
  TOKEN_SMOULDER_ORCH_DIR: FIX,
  TOKEN_SMOULDER_STATE_DIR: stateDir,
});

const writeLock = async (
  stateDir: string,
  name: string,
  pid: number,
  acquiredAt = new Date().toISOString(),
): Promise<string> => {
  const lockDir = join(stateDir, 'locks');
  await mkdir(lockDir, { recursive: true });
  const path = join(lockDir, `${name}.lock`);
  await writeFile(
    path,
    JSON.stringify({
      pid,
      hostname: 'localhost',
      acquiredAt,
      owner: 'scheduler',
      scope: 'orchestration',
      orchestrationName: name,
    }),
  );
  return path;
};

const fileExists = async (p: string): Promise<boolean> =>
  stat(p)
    .then(() => true)
    .catch(() => false);

describe('CLI unlock', () => {
  it('refuses to clear a lock whose pid is alive (no --force)', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'unlock-'));
    const lockPath = await writeLock(stateDir, 'valid-readonly', process.pid);

    let exit = 0;
    try {
      await exec(BIN, ['unlock', 'valid-readonly'], { env: baseEnv(stateDir) });
    } catch (e: unknown) {
      exit = (e as { code?: number }).code ?? 0;
    }
    expect(exit).not.toBe(0);
    expect(await fileExists(lockPath)).toBe(true);
  });

  it('clears a stale lock (pid not alive) without --force', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'unlock-'));
    const lockPath = await writeLock(stateDir, 'valid-readonly', 9_999_999);

    await exec(BIN, ['unlock', 'valid-readonly'], { env: baseEnv(stateDir) });
    expect(await fileExists(lockPath)).toBe(false);
  });

  it('refuses --force on a non-TTY (no confirmation possible)', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'unlock-'));
    const lockPath = await writeLock(stateDir, 'valid-readonly', process.pid);

    let exit = 0;
    try {
      await exec(BIN, ['unlock', 'valid-readonly', '--force'], { env: baseEnv(stateDir) });
    } catch (e: unknown) {
      exit = (e as { code?: number }).code ?? 0;
    }
    expect(exit).not.toBe(0);
    expect(await fileExists(lockPath)).toBe(true);
  });
});

void readFile;
