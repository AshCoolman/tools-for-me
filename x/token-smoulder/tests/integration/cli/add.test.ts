import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeScaffoldEnv } from './helpers/scaffold-env.js';

const exec = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'token-smoulder');

type AddVerdict = {
  name: string;
  oneLiner: string | null;
  scaffolded: boolean;
  inferred: { riskClass: string; signal: string } | null;
  policy: { allowlist: string[] };
  next: string;
};

async function runAdd(
  env: NodeJS.ProcessEnv,
  arg: string,
): Promise<{ exitCode: number; verdict: AddVerdict }> {
  try {
    const res = await exec(BIN, ['add', arg, '--json'], { env });
    return { exitCode: 0, verdict: JSON.parse(res.stdout) as AddVerdict };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return {
      exitCode: err.code ?? -1,
      verdict: JSON.parse(err.stdout ?? '{}') as AddVerdict,
    };
  }
}

describe('cli: add', () => {
  it('scaffolds from a one-line idea, auto-derives name and riskClass, auto-aligns policy', async () => {
    const { orchDir, env } = await makeScaffoldEnv();

    const { exitCode, verdict } = await runAdd(
      env,
      'tidy our test fixtures: drop unused files',
    );

    expect(exitCode).toBe(3);
    expect(verdict.scaffolded).toBe(true);
    expect(verdict.name).toBe('tidy-test-fixtures-drop');
    expect(verdict.oneLiner).toBe('tidy our test fixtures: drop unused files');
    expect(verdict.inferred?.riskClass).toBe('repo-local');
    expect(verdict.inferred?.signal).toBe("verb 'tidy'");
    expect(verdict.policy.allowlist).toEqual(['readonly', 'repo-local']);
    expect(verdict.next).toContain(verdict.name);

    const dir = join(orchDir, verdict.name);
    const policy = await readFile(join(dir, 'policy.ts'), 'utf8');
    expect(policy).toContain("safeRiskClass(['readonly', 'repo-local']");
    const executor = await readFile(join(dir, 'executor.ts'), 'utf8');
    expect(executor).toContain("riskClass: 'repo-local'");
  });

  it('re-verifies an existing unit without re-scaffolding (idempotent)', async () => {
    const { orchDir, env } = await makeScaffoldEnv();

    await runAdd(env, 'audit our config files for drift');
    const after = await runAdd(env, 'audit-config-files-drift');

    expect(after.verdict.scaffolded).toBe(false);
    expect(after.verdict.name).toBe('audit-config-files-drift');
    expect(after.verdict.policy.allowlist).toEqual(['readonly']);

    const dir = join(orchDir, 'audit-config-files-drift');
    const work = await readFile(join(dir, 'work.md'), 'utf8');
    expect(work).toContain('audit our config files for drift');
  });

  it('rejects bare names that do not exist with a friendly error', async () => {
    const { env } = await makeScaffoldEnv();

    await expect(
      exec(BIN, ['add', 'no-such-unit'], { env }),
    ).rejects.toMatchObject({ code: 4 });
  });
});
