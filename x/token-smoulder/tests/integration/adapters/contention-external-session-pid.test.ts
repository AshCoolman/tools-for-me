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
  it('excludes scheduler-owned processes (--owner=scheduler in argv)', async () => {
    // Tagged child: command contains --owner=scheduler so the detector skips it.
    const tagged = spawn(
      process.execPath,
      ['-e', `setInterval(()=>{}, 100); process.title='claude-child --owner=scheduler';`],
      {
        env: { ...process.env, TOKEN_SMOULDER_OWNER: 'scheduler' },
        stdio: 'ignore',
      },
    );
    spawned.push(tagged);
    await new Promise(r => setTimeout(r, 200));

    const det = new ExternalSessionPidContentionDetector({
      patterns: [/claude-child/],
      excludeOwnPid: process.pid,
    });
    const sessions = await det.listExternalSessions();
    expect(sessions.find(s => s.pid === tagged.pid)).toBeUndefined();
  });

  it('detects an untagged matching process', async () => {
    const untagged = spawn(process.execPath, ['-e', `setInterval(()=>{}, 100); process.title='claude-untagged';`], {
      stdio: 'ignore',
    });
    spawned.push(untagged);
    await new Promise(r => setTimeout(r, 200));

    const det = new ExternalSessionPidContentionDetector({
      patterns: [/claude-untagged/],
      excludeOwnPid: process.pid,
    });
    const sessions = await det.listExternalSessions();
    expect(sessions.some(s => s.pid === untagged.pid)).toBe(true);
  });
});
