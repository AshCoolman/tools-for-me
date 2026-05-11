import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BIN = join(process.cwd(), 'bin', 'token-smoulder');
const FIX = join(process.cwd(), 'tests', 'fixtures', 'orchestration');

export type ServerHandle = {
  baseURL: string;
  proc: ChildProcess;
  cleanup: () => void;
};

export function startServer(extraEnv: Record<string, string> = {}): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const proc = spawn(BIN, ['ui', '--port', '0'], {
      env: {
        ...process.env,
        TOKEN_SMOULDER_ORCH_DIR: FIX,
        TOKEN_SMOULDER_QUOTA_SOURCE: 'fake-pass',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    proc.stdout!.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      const m = stdout.match(/(http:\/\/[^\s]+)/);
      if (m?.[1]) {
        resolve({
          baseURL: m[1],
          proc,
          cleanup: () => { try { proc.kill('SIGTERM'); } catch {} },
        });
      }
    });

    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (!stdout.includes('http://')) reject(new Error(`server exited ${code} before printing URL`));
    });
    setTimeout(() => reject(new Error('server start timeout')), 10_000);
  });
}

export async function seedRunState(stateDir: string, unitName: string): Promise<void> {
  const runsDir = join(stateDir, 'runs', unitName);
  await mkdir(runsDir, { recursive: true });
  const record = {
    runId: 'e2e-run-001',
    orchestrationName: unitName,
    status: 'failed',
    riskClass: 'readonly',
    workHash: 'a'.repeat(64),
    policyHash: 'b'.repeat(64),
    executorHash: 'c'.repeat(64),
    startedAt: '2026-05-11T00:00:00.000Z',
    endedAt: '2026-05-11T00:00:01.000Z',
    steps: [
      { index: 0, prompt: 'test prompt for e2e', status: 'failed', error: 'simulated agent failure' },
    ],
    failureSignature: 'simulated agent failure',
    decision: {
      shouldRun: true,
      orchestrationName: unitName,
      reasons: ['always: scheduled tick'],
      failedReasons: [],
      riskClass: 'readonly',
      selectedWorkHash: 'a'.repeat(64),
      evaluatedAt: '2026-05-11T00:00:00.000Z',
    },
  };
  await writeFile(join(runsDir, 'latest.json'), JSON.stringify(record));
}
