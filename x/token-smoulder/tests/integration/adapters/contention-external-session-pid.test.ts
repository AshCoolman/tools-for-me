import { describe, expect, it, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { ExternalSessionPidContentionDetector } from '../../../src/adapters/contention/external-session-pid.js';

const spawned: ChildProcess[] = [];

afterEach(() => {
  for (const c of spawned.splice(0)) {
    try {
      c.kill('SIGKILL');
    } catch {
      // intentional: best-effort cleanup of test fixture process
    }
  }
});

describe('ExternalSessionPidContentionDetector', () => {
  it('excludes scheduler-owned processes (TOKEN_SMOULDER_OWNER env)', async () => {
    const marker = `smoulder_tagged_${Date.now()}`;
    const tagged = spawn(
      process.execPath,
      ['-e', `globalThis.${marker}=1; setInterval(()=>{}, 100)`],
      {
        env: { ...process.env, TOKEN_SMOULDER_OWNER: 'scheduler' },
        stdio: 'ignore',
      },
    );
    spawned.push(tagged);
    await new Promise(r => setTimeout(r, 300));

    const det = new ExternalSessionPidContentionDetector({
      patterns: [new RegExp(marker)],
      excludeOwnPid: process.pid,
    });
    const sessions = await det.listExternalSessions();
    expect(sessions.find(s => s.pid === tagged.pid)).toBeUndefined();
  });

  it('detects an untagged matching process', async () => {
    const marker = `smoulder_untagged_${Date.now()}`;
    const untagged = spawn(process.execPath, ['-e', `globalThis.${marker}=1; setInterval(()=>{}, 100)`], {
      stdio: 'ignore',
    });
    spawned.push(untagged);
    await new Promise(r => setTimeout(r, 300));

    const det = new ExternalSessionPidContentionDetector({
      patterns: [new RegExp(marker)],
      excludeOwnPid: process.pid,
    });
    const sessions = await det.listExternalSessions();
    expect(sessions.some(s => s.pid === untagged.pid)).toBe(true);
  });
});
