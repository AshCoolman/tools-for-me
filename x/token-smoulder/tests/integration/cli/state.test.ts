import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { hashContent } from '../../../src/lib/hashing.js';

const exec = promisify(execFile);

const BIN = join(process.cwd(), 'bin', 'token-smoulder');
const FIX = join(process.cwd(), 'tests', 'fixtures', 'orchestration');

const baseEnv = (stateDir: string) => ({
  ...process.env,
  TOKEN_SMOULDER_ORCH_DIR: FIX,
  TOKEN_SMOULDER_STATE_DIR: stateDir,
});

describe('CLI state', () => {
  it('prints latest run record for an orchestration', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'state-'));
    const runsDir = join(stateDir, 'runs', 'demo');
    await mkdir(runsDir, { recursive: true });
    const runId = ulid();
    const record = {
      runId,
      orchestrationName: 'demo',
      status: 'completed',
      riskClass: 'readonly',
      workHash: hashContent('w'),
      policyHash: hashContent('p'),
      executorHash: hashContent('e'),
      startedAt: '2026-05-06T00:00:00Z',
      steps: [],
      decision: {
        shouldRun: true,
        orchestrationName: 'demo',
        reasons: [],
        failedReasons: [],
        riskClass: 'readonly',
        selectedWorkHash: hashContent('w'),
        evaluatedAt: '2026-05-06T00:00:00Z',
      },
    };
    await writeFile(join(runsDir, 'latest.json'), JSON.stringify(record));

    const { stdout } = await exec(BIN, ['state', 'demo'], { env: baseEnv(stateDir) });
    const parsed = JSON.parse(stdout) as { runId: string; status: string };
    expect(parsed.runId).toBe(runId);
    expect(parsed.status).toBe('completed');
  });
});
