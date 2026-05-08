import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentRemoteHumanInput } from '../../../src/adapters/input/agent-remote.js';
import { BoundaryError } from '../../../src/lib/errors.js';

const writeFakeAgentRemote = async (dir: string, body: string) => {
  const p = join(dir, 'agent-remote');
  await writeFile(p, body);
  await chmod(p, 0o755);
};

const PATH_WITH = (dir: string) => `${dir}:${process.env.PATH ?? ''}`;

describe('AgentRemoteHumanInput', () => {
  it('isAvailable returns true when binary is on PATH', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'agr-'));
    await writeFakeAgentRemote(
      binDir,
      `#!/usr/bin/env bash
echo "ok"
`,
    );
    const ch = new AgentRemoteHumanInput({ env: { PATH: PATH_WITH(binDir) } });
    expect(await ch.isAvailable()).toBe(true);
  });

  it('returns the agent-remote stdout as the answer', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'agr-'));
    await writeFakeAgentRemote(
      binDir,
      `#!/usr/bin/env bash
read -r line
echo "answer:\${line}"
`,
    );
    const ch = new AgentRemoteHumanInput({ env: { PATH: PATH_WITH(binDir) } });
    const answer = await ch.request({
      orchestrationName: 'demo',
      runId: 'r1',
      agentResponse: 'q?',
      timeoutMs: 5_000,
    });
    expect(answer.trim().startsWith('answer:')).toBe(true);
  });

  it('throws BoundaryError on non-zero exit', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'agr-'));
    await writeFakeAgentRemote(
      binDir,
      `#!/usr/bin/env bash
echo "boom" >&2
exit 7
`,
    );
    const ch = new AgentRemoteHumanInput({ env: { PATH: PATH_WITH(binDir) } });
    await expect(
      ch.request({
        orchestrationName: 'demo',
        runId: 'r1',
        agentResponse: 'q?',
        timeoutMs: 5_000,
      }),
    ).rejects.toBeInstanceOf(BoundaryError);
  });
});
