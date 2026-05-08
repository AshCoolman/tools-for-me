import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileInboxHumanInput } from '../../../src/adapters/input/file-inbox.js';
import { InputTimeoutError } from '../../../src/adapters/input/interface.js';

describe('FileInboxHumanInput', () => {
  it('writes <runId>.req then resolves on <runId>.res', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'inbox-'));
    const inboxDir = join(stateDir, 'inbox');
    const ch = new FileInboxHumanInput({ stateDir, pollMs: 50 });

    const runId = 'r1';
    const ans = ch.request({
      orchestrationName: 'demo',
      runId,
      agentResponse: 'what?',
      timeoutMs: 5_000,
    });

    const reqPath = join(inboxDir, `${runId}.req`);
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    const reqRaw = await readFile(reqPath, 'utf8');
    expect(reqRaw).toContain('what?');

    await mkdir(inboxDir, { recursive: true });
    await writeFile(join(inboxDir, `${runId}.res`), 'the answer');

    expect(await ans).toBe('the answer');
  });

  it('rejects with InputTimeoutError when no .res file appears in time', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'inbox-'));
    const ch = new FileInboxHumanInput({ stateDir, pollMs: 50 });
    await expect(
      ch.request({
        orchestrationName: 'demo',
        runId: 'r2',
        agentResponse: 'q?',
        timeoutMs: 200,
      }),
    ).rejects.toBeInstanceOf(InputTimeoutError);
  });
});
