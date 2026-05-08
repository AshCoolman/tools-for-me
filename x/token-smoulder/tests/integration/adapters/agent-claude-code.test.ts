import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCodeAgent } from '../../../src/adapters/agent/claude-code.js';
import { BoundaryError } from '../../../src/lib/errors.js';

const writeBin = async (dir: string, name: string, body: string) => {
  const p = join(dir, name);
  await writeFile(p, body);
  await chmod(p, 0o755);
  return p;
};

describe('ClaudeCodeAgent', () => {
  it('starts a session, sends a prompt, parses JSONL response, stops cleanly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-'));
    // Fake claude binary that:
    // 1. checks owner flag
    // 2. checks env tag
    // 3. reads prompt from stdin (one line)
    // 4. emits JSONL response and exits 0
    await writeBin(
      dir,
      'claude',
      `#!/usr/bin/env bash
set -e
seen_owner=0
for arg in "$@"; do
  if [ "$arg" = "--owner=scheduler" ]; then seen_owner=1; fi
done
if [ "$seen_owner" != "1" ]; then echo "missing --owner=scheduler" >&2; exit 7; fi
if [ "$TOKEN_SMOULDER_OWNER" != "scheduler" ]; then echo "missing env tag" >&2; exit 8; fi

read -r prompt
echo '{"text":"got: '"$prompt"'","needsInput":false}'
`,
    );
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` };
    const a = new ClaudeCodeAgent({ env });
    const sess = await a.startSession({ owner: 'scheduler', orchestrationName: 'demo' });
    expect(sess.owner).toBe('scheduler');
    expect(sess.orchestrationName).toBe('demo');
    const resp = await a.sendPrompt({ sessionId: sess.sessionId, prompt: 'hi' });
    expect(resp.text).toContain('got: hi');
    expect(resp.needsInput).toBe(false);
    await a.stopSession({ sessionId: sess.sessionId, reason: 'done' });
  });

  it('throws BoundaryError on transport failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-'));
    await writeBin(
      dir,
      'claude',
      `#!/usr/bin/env bash
echo 'oops' >&2
exit 9
`,
    );
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` };
    const a = new ClaudeCodeAgent({ env });
    const sess = await a.startSession({ owner: 'scheduler', orchestrationName: 'demo' });
    await expect(a.sendPrompt({ sessionId: sess.sessionId, prompt: 'hi' })).rejects.toThrow(
      BoundaryError,
    );
  });
});
