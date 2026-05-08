import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { hashContent, hashFile } from '../../../src/lib/hashing.js';

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

describe('CLI run --resume', () => {
  it('skips already-completed steps and finishes the run', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'resume-'));
    const binDir = await mkdtemp(join(tmpdir(), 'bin-'));
    await writeFakeClaude(binDir);

    const orchName = 'multi-step';
    const workMd = await readFile(join(FIX, orchName, 'work.md'), 'utf8');
    const workHash = hashContent(workMd);
    const policyHash = await hashFile(join(FIX, orchName, 'policy.ts'));
    const executorHash = await hashFile(join(FIX, orchName, 'executor.ts'));

    const decision = {
      shouldRun: true as const,
      orchestrationName: orchName,
      reasons: ['fabricated'],
      failedReasons: [],
      riskClass: 'readonly' as const,
      selectedWorkHash: workHash,
      evaluatedAt: '2026-05-06T00:00:00Z',
    };

    const fabricated = {
      runId: ulid(),
      orchestrationName: orchName,
      status: 'running',
      riskClass: 'readonly',
      workHash,
      policyHash,
      executorHash,
      startedAt: '2026-05-06T00:00:00Z',
      steps: [
        { index: 0, prompt: 'step-0', status: 'completed', startedAt: '2026-05-06T00:00:00Z', completedAt: '2026-05-06T00:00:01Z' },
        { index: 1, prompt: 'step-1', status: 'pending' },
      ],
      decision,
    };

    const runsDir = join(stateDir, 'runs', orchName);
    await mkdir(runsDir, { recursive: true });
    await writeFile(join(runsDir, 'latest.json'), JSON.stringify(fabricated));
    await writeFile(join(runsDir, `${fabricated.runId}.json`), JSON.stringify(fabricated));

    await exec(BIN, ['run', orchName, '--resume'], { env: baseEnv(stateDir, binDir) });

    const after = JSON.parse(await readFile(join(runsDir, 'latest.json'), 'utf8')) as {
      status: string;
      steps: { status: string; prompt: string }[];
    };
    expect(after.status).toBe('completed');
    expect(after.steps.map(s => s.status)).toEqual(['completed', 'completed']);
  });
});
