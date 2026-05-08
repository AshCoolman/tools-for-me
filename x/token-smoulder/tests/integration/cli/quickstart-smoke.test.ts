import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, chmod } from 'node:fs/promises';
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

describe('quickstart smoke', () => {
  it('scan → check → run --once → state → events for valid-readonly', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'smoke-'));
    const binDir = await mkdtemp(join(tmpdir(), 'bin-'));
    await writeFakeClaude(binDir);
    const env = baseEnv(stateDir, binDir);

    const scanRes = await exec(BIN, ['scan', '--json'], { env });
    const scan = JSON.parse(scanRes.stdout) as { valid: Array<{ name: string }> };
    expect(scan.valid.some(v => v.name === 'valid-readonly')).toBe(true);

    const checkRes = await exec(BIN, ['check', 'valid-readonly', '--json'], { env });
    const check = JSON.parse(checkRes.stdout) as { shouldRun: boolean; reasons: string[] };
    expect(check.shouldRun).toBe(true);

    await exec(BIN, ['run', 'valid-readonly', '--once'], { env });

    const stateRes = await exec(BIN, ['state', 'valid-readonly'], { env });
    const state = JSON.parse(stateRes.stdout) as { status: string };
    expect(state.status).toBe('completed');

    const eventsRes = await exec(BIN, ['events', '--limit=200'], { env });
    const eventNames = eventsRes.stdout
      .split('\n')
      .filter(Boolean)
      .map(l => (JSON.parse(l) as { name: string }).name);

    const required = [
      'policy_evaluated',
      'dispatch_allowed',
      'run_started',
      'prompt_started',
      'prompt_completed',
      'run_completed',
    ];
    for (const name of required) {
      expect(eventNames).toContain(name);
    }

    const ndjson = await readFile(join(stateDir, 'events.ndjson'), 'utf8');
    expect(ndjson.trim().length).toBeGreaterThan(0);
  });
});
