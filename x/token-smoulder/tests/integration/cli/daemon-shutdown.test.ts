import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const ENTRY = join(process.cwd(), 'src', 'cli', 'index.ts');
const FIX = join(process.cwd(), 'tests', 'fixtures', 'orchestration');

const writeFakeClaude = async (dir: string) => {
  const p = join(dir, 'claude');
  await writeFile(
    p,
    `#!/usr/bin/env bash
read -r prompt
echo '{"type":"result","subtype":"success","is_error":false,"result":"ok","stop_reason":"end_turn","session_id":"fake","duration_ms":100}'
`,
  );
  await chmod(p, 0o755);
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const readEvents = async (stateDir: string) => {
  const raw = await readFile(join(stateDir, 'events.ndjson'), 'utf8').catch(() => '');
  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as { name: string });
};

describe('CLI daemon shutdown', () => {
  it('finishes in-flight runs within grace period and exits 0 on SIGINT', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'daemon-'));
    const binDir = await mkdtemp(join(tmpdir(), 'bin-'));
    await writeFakeClaude(binDir);

    const child = spawn(TSX, [ENTRY, 'daemon', '--tick=200'], {
      env: {
        ...process.env,
        TOKEN_SMOULDER_ORCH_DIR: FIX,
        TOKEN_SMOULDER_STATE_DIR: stateDir,
        TOKEN_SMOULDER_QUOTA_SOURCE: 'fake-pass',
        TOKEN_SMOULDER_TICK_MS: '200',
        TOKEN_SMOULDER_SHUTDOWN_GRACE_MS: '5000',
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const waitForExit = new Promise<number>(resolve => {
      child.on('exit', code => resolve(code ?? 0));
    });

    await wait(2500);
    child.kill('SIGINT');
    const code = await Promise.race([
      waitForExit,
      wait(10000).then(() => -1),
    ]);
    if (code === -1) {
      child.kill('SIGKILL');
      throw new Error('daemon did not exit within 10s');
    }
    expect(code).toBe(0);

    const events = await readEvents(stateDir);
    const names = new Set(events.map(e => e.name));
    expect(names.has('run_completed') || names.has('run_paused')).toBe(true);
  }, 20_000);
});
