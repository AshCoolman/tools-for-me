import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

const BIN = join(process.cwd(), 'bin', 'token-smoulder');
const FIX = join(process.cwd(), 'tests', 'fixtures', 'orchestration');

const run = async (args: string[], stateDir?: string) => {
  return exec(BIN, args, {
    env: {
      ...process.env,
      TOKEN_SMOULDER_ORCH_DIR: FIX,
      TOKEN_SMOULDER_STATE_DIR: stateDir ?? '',
      TOKEN_SMOULDER_QUOTA_SOURCE: 'fake-pass',
    },
  });
};

describe('CLI check', () => {
  it('exits 0 and prints a DispatchDecision for valid-readonly with --json', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'check-'));
    const { stdout } = await run(['check', 'valid-readonly', '--json'], stateDir);
    const parsed = JSON.parse(stdout);
    expect(parsed.orchestrationName).toBe('valid-readonly');
    expect(typeof parsed.shouldRun).toBe('boolean');
    expect(Array.isArray(parsed.reasons)).toBe(true);
    expect(Array.isArray(parsed.failedReasons)).toBe(true);
    expect(parsed.riskClass).toBe('readonly');
  });

  it('--strict exits 3 when policy fails', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'check-'));
    let exit = 0;
    try {
      await exec(BIN, ['check', 'destructive', '--strict', '--json'], {
        env: {
          ...process.env,
          TOKEN_SMOULDER_ORCH_DIR: FIX,
          TOKEN_SMOULDER_STATE_DIR: stateDir,
          TOKEN_SMOULDER_QUOTA_SOURCE: 'fake-pass',
        },
      });
    } catch (e: unknown) {
      exit = (e as { code?: number }).code ?? 0;
    }
    expect(exit).toBe(3);
  });
});
