import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { makeScaffoldEnv } from './helpers/scaffold-env.js';

const exec = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'token-smoulder');

describe('cli: new', () => {
  it('scaffolds work.md, policy.ts, executor.ts with the one-liner inlined', async () => {
    const { orchDir, env } = await makeScaffoldEnv();

    const oneLiner = 'tidy our test fixtures: drop unused files and normalise headers';
    const res = await exec(BIN, ['new', 'tidy-fixtures', oneLiner, '--json'], { env });
    const parsed = JSON.parse(res.stdout) as { name: string; files: string[] };
    expect(parsed.name).toBe('tidy-fixtures');
    expect(parsed.files).toHaveLength(3);

    const dir = join(orchDir, 'tidy-fixtures');
    for (const f of ['work.md', 'policy.ts', 'executor.ts']) {
      const s = await stat(join(dir, f));
      expect(s.isFile()).toBe(true);
    }

    const work = await readFile(join(dir, 'work.md'), 'utf8');
    expect(work).toMatch(/# Objective\n\ntidy our test fixtures: drop unused files and normalise headers\n/);
    expect(work).toContain('TODO(token-smoulder)');
  });

  it('lists the new unit as valid in scan and blocks check until TODOs are resolved', async () => {
    const { env } = await makeScaffoldEnv();

    await exec(BIN, ['new', 'demo-unit', 'demo one-liner'], { env });

    const scanRes = await exec(BIN, ['scan', '--json'], { env });
    const scan = JSON.parse(scanRes.stdout) as { valid: Array<{ name: string }> };
    expect(scan.valid.some(v => v.name === 'demo-unit')).toBe(true);

    const checkRes = await exec(BIN, ['check', 'demo-unit', '--json'], { env });
    const check = JSON.parse(checkRes.stdout) as {
      shouldRun: boolean;
      reasons: string[];
      failedReasons: string[];
    };
    expect(check.shouldRun).toBe(false);
    expect(check.failedReasons.some(r => r.includes('noTodoSentinels'))).toBe(true);
  });

  it('rejects invalid names', async () => {
    const { env } = await makeScaffoldEnv();

    await expect(
      exec(BIN, ['new', 'BAD_NAME', 'one liner'], { env }),
    ).rejects.toMatchObject({ code: 2 });
  });

  it('refuses to overwrite an existing orchestration', async () => {
    const { env } = await makeScaffoldEnv();

    await exec(BIN, ['new', 'twice', 'first try'], { env });
    await expect(
      exec(BIN, ['new', 'twice', 'second try'], { env }),
    ).rejects.toMatchObject({ code: 4 });
  });
});
