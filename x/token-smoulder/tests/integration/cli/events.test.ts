import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

const BIN = join(process.cwd(), 'bin', 'token-smoulder');

const baseEnv = (stateDir: string) => ({
  ...process.env,
  TOKEN_SMOULDER_STATE_DIR: stateDir,
});

const writeEvents = async (
  stateDir: string,
  events: Array<{ name: string; timestamp: string; payload?: Record<string, unknown> }>,
): Promise<void> => {
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, 'events.ndjson'),
    events.map(e => JSON.stringify(e)).join('\n') + '\n',
  );
};

describe('CLI events', () => {
  it('filters by --type', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'events-'));
    await writeEvents(stateDir, [
      { name: 'policy_evaluated', timestamp: '2026-05-06T00:00:00Z' },
      { name: 'dispatch_blocked', timestamp: '2026-05-06T00:00:01Z' },
      { name: 'dispatch_allowed', timestamp: '2026-05-06T00:00:02Z' },
      { name: 'dispatch_blocked', timestamp: '2026-05-06T00:00:03Z' },
    ]);

    const { stdout } = await exec(
      BIN,
      ['events', '--type=dispatch_blocked'],
      { env: baseEnv(stateDir) },
    );
    const lines = stdout.split('\n').filter(Boolean);
    const parsed = lines.map(l => JSON.parse(l) as { name: string });
    expect(parsed.every(e => e.name === 'dispatch_blocked')).toBe(true);
    expect(parsed.length).toBe(2);
  });

  it('filters by --since duration', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'events-'));
    const now = Date.now();
    await writeEvents(stateDir, [
      { name: 'policy_evaluated', timestamp: new Date(now - 60 * 60_000).toISOString() },
      { name: 'policy_evaluated', timestamp: new Date(now - 60_000).toISOString() },
    ]);

    const { stdout } = await exec(BIN, ['events', '--since=10m'], {
      env: baseEnv(stateDir),
    });
    const lines = stdout.split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
  });
});
