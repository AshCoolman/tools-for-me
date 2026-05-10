import { describe, expect, it, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(process.cwd(), 'bin', 'token-smoulder');
const FIX = join(process.cwd(), 'tests', 'fixtures', 'orchestration');

const procs: ChildProcess[] = [];

function startServer(extraEnv: Record<string, string> = {}): Promise<{ proc: ChildProcess; base: string }> {
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
    procs.push(proc);

    let stdout = '';
    proc.stdout!.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      const m = stdout.match(/(http:\/\/[^\s]+)/);
      if (m?.[1]) resolve({ proc, base: m[1] });
    });

    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (!stdout.includes('http://')) reject(new Error(`server exited ${code} before printing URL`));
    });
    setTimeout(() => reject(new Error('server start timeout')), 10_000);
  });
}

afterEach(() => {
  for (const p of procs) {
    try { p.kill('SIGTERM'); } catch {}
  }
  procs.length = 0;
});

describe('UI server', () => {
  it('GET /api/units returns items array matching list shape', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/units`);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    for (const item of body.items as Array<{ name: string; riskClass: string }>) {
      expect(typeof item.name).toBe('string');
      expect(typeof item.riskClass).toBe('string');
    }
  }, 15_000);

  it('GET /api/units/:name/state returns 404 for no run record', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/units/valid-readonly/state`);
    expect(res.status).toBe(404);
  }, 15_000);

  it('GET /api/units/:name/state returns run record when one exists', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const runsDir = join(stateDir, 'runs', 'valid-readonly');
    await mkdir(runsDir, { recursive: true });
    const record = {
      runId: 'test-run-001',
      orchestrationName: 'valid-readonly',
      status: 'failed',
      riskClass: 'readonly',
      workHash: 'a'.repeat(64),
      policyHash: 'b'.repeat(64),
      executorHash: 'c'.repeat(64),
      startedAt: '2026-05-10T00:00:00.000Z',
      endedAt: '2026-05-10T00:00:01.000Z',
      steps: [{ index: 0, prompt: 'test prompt', status: 'failed', error: 'test error' }],
      failureSignature: 'test error',
      decision: {
        shouldRun: true,
        orchestrationName: 'valid-readonly',
        reasons: ['test reason'],
        failedReasons: [],
        riskClass: 'readonly',
        selectedWorkHash: 'a'.repeat(64),
        evaluatedAt: '2026-05-10T00:00:00.000Z',
      },
    };
    await writeFile(join(runsDir, 'latest.json'), JSON.stringify(record));

    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });
    const res = await fetch(`${base}/api/units/valid-readonly/state`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.runId).toBe('test-run-001');
    expect(body.status).toBe('failed');
    expect(body.failureSignature).toBe('test error');
    expect(Array.isArray(body.steps)).toBe(true);
  }, 15_000);

  it('GET /api/quota returns session and week fields', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/quota`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('session');
    expect(body).toHaveProperty('week');
  }, 15_000);

  it('GET /api/suppressions returns an array', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/suppressions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  }, 15_000);

  it('GET /api/prefs returns defaults when no file exists', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/prefs`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe('object');
  }, 15_000);

  it('GET /api/sources returns sources array', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/sources`);
    expect(res.status).toBe(200);
    const body = await res.json() as { sources: unknown[] };
    expect(body).toHaveProperty('sources');
    expect(Array.isArray(body.sources)).toBe(true);
  }, 15_000);

  it('GET /api/units/:name/work returns work.md text', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/units/valid-readonly/work`);
    expect(res.status).toBe(200);
    const body = await res.json() as { text: string };
    expect(body.text).toContain('# Objective');
  }, 15_000);

  it('PUT /api/units/:name/work saves and returns status', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const updated = '# Objective\n\nUpdated via test.\n';
    const res = await fetch(`${base}/api/units/valid-readonly/work`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: updated }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('saved');

    const onDisk = await readFile(join(FIX, 'valid-readonly', 'work.md'), 'utf8');
    expect(onDisk).toBe(updated);

    await writeFile(
      join(FIX, 'valid-readonly', 'work.md'),
      '# Objective\n\nPrint "hello world" via the agent.\n\n# Context\n\nQuickstart smoke test fixture.\n\n# Constraints\n\n- readonly\n- no filesystem writes\n',
    );
  }, 15_000);

  it('GET /api/daemon/status returns running field', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/daemon/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as { running: boolean };
    expect(typeof body.running).toBe('boolean');
  }, 15_000);

  it('GET / serves index.html', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(base);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  }, 15_000);

  it('GET /events returns SSE stream with heartbeat', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain(':');
    reader.cancel();
  }, 15_000);

  it('POST /api/add with missing idea returns 400', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  }, 15_000);

  it('GET /api/events returns recent events array', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/events?since=1h`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  }, 15_000);

  it('404 for unknown route', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'ui-'));
    const { base } = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });

    const res = await fetch(`${base}/api/nonexistent`);
    expect(res.status).toBe(404);
  }, 15_000);
});
