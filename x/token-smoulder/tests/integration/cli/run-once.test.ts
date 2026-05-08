import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

const BIN = join(process.cwd(), 'bin', 'token-smoulder');
const FIX = join(process.cwd(), 'tests', 'fixtures', 'orchestration');

const writeFakeClaude = async (dir: string) => {
  const p = join(dir, 'claude');
  await writeFile(
    p,
    `#!/usr/bin/env bash
read -r prompt
echo '{"text":"ok","needsInput":false}'
`,
  );
  await chmod(p, 0o755);
};

const baseEnv = (stateDir: string, pathPrefix: string) => ({
  ...process.env,
  TOKEN_SMOULDER_ORCH_DIR: FIX,
  TOKEN_SMOULDER_STATE_DIR: stateDir,
  TOKEN_SMOULDER_QUOTA_SOURCE: 'fake-pass',
  PATH: `${pathPrefix}:${process.env.PATH ?? ''}`,
});

describe('CLI run --once', () => {
  it('completes happy path and writes events.ndjson', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'run-'));
    const binDir = await mkdtemp(join(tmpdir(), 'bin-'));
    await writeFakeClaude(binDir);

    await exec(BIN, ['run', 'valid-readonly', '--once'], { env: baseEnv(stateDir, binDir) });

    const ev = await readFile(join(stateDir, 'events.ndjson'), 'utf8');
    const names = ev
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line).name);
    expect(names).toContain('policy_evaluated');
    expect(names).toContain('dispatch_allowed');
    expect(names).toContain('run_started');
    expect(names).toContain('prompt_started');
    expect(names).toContain('prompt_completed');
    expect(names).toContain('run_completed');
  });

  it('exits 3 when policy blocks (destructive)', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'run-'));
    const binDir = await mkdtemp(join(tmpdir(), 'bin-'));
    await writeFakeClaude(binDir);

    let exit = 0;
    try {
      await exec(BIN, ['run', 'destructive', '--once'], { env: baseEnv(stateDir, binDir) });
    } catch (e: unknown) {
      exit = (e as { code?: number }).code ?? 0;
    }
    expect(exit).toBe(3);
  });

  it('exits 4 on lock contention', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'run-'));
    const binDir = await mkdtemp(join(tmpdir(), 'bin-'));
    await writeFakeClaude(binDir);

    // Pre-create a lock owned by an alive pid (this test process).
    const lockDir = join(stateDir, 'locks');
    await mkdir(lockDir, { recursive: true });
    await writeFile(
      join(lockDir, 'valid-readonly.lock'),
      JSON.stringify({
        pid: process.pid,
        hostname: 'localhost',
        acquiredAt: new Date().toISOString(),
        owner: 'scheduler',
        scope: 'orchestration',
        orchestrationName: 'valid-readonly',
      }),
    );

    let exit = 0;
    try {
      await exec(BIN, ['run', 'valid-readonly', '--once'], { env: baseEnv(stateDir, binDir) });
    } catch (e: unknown) {
      exit = (e as { code?: number }).code ?? 0;
    }
    expect(exit).toBe(4);
  });
});
