import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const exec = promisify(execFile);

const BIN = join(process.cwd(), 'bin', 'token-smoulder');
const FIX = join(process.cwd(), 'tests', 'fixtures', 'orchestration');

const run = async (args: string[]) => {
  const { stdout, stderr } = await exec(BIN, args, {
    env: {
      ...process.env,
      TOKEN_SMOULDER_ORCH_DIR: FIX,
      TOKEN_SMOULDER_STATE_DIR: '',
    },
  });
  return { stdout, stderr };
};

describe('CLI scan', () => {
  it('lists valid and invalid fixtures correctly with --json', async () => {
    const { stdout } = await run(['scan', '--json']);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed.valid)).toBe(true);
    expect(Array.isArray(parsed.invalid)).toBe(true);
    const validNames = parsed.valid.map((v: { name: string }) => v.name);
    expect(validNames).toContain('valid-readonly');
    const invalidNames = parsed.invalid.map((v: { name: string }) => v.name);
    expect(invalidNames).toContain('invalid-missing-executor');
  });
});
