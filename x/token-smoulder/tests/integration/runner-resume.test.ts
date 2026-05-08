import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsStorage } from '../../src/adapters/storage/fs.js';
import { Runner, type ExecutorPlan } from '../../src/core/runner.js';
import { hashContent } from '../../src/lib/hashing.js';
import type { AgentClient, AgentResponse, AgentSession } from '../../src/adapters/agent/interface.js';
import type { RunRecord } from '../../src/adapters/storage/internal-types.js';
import { ulid } from 'ulid';

const HASH = (s: string) => hashContent(s);

const plan: ExecutorPlan = {
  riskClass: 'readonly',
  objective: 'o',
  context: 'c',
  constraints: 'k',
  promptFlow: ['step-0', 'step-1', 'step-2'],
  stopConditions: ['fatal_error'],
};

const decision = {
  shouldRun: true as const,
  orchestrationName: 'demo',
  reasons: ['ok'],
  failedReasons: [],
  riskClass: 'readonly' as const,
  selectedWorkHash: HASH('w'),
  evaluatedAt: '2026-05-06T00:00:00Z',
};

class CountingAgent implements AgentClient {
  prompts: string[] = [];
  startedSessions = 0;
  async startSession(args: { owner: 'scheduler'; orchestrationName: string }): Promise<AgentSession> {
    this.startedSessions++;
    return {
      sessionId: ulid(),
      startedAt: new Date().toISOString(),
      owner: args.owner,
      orchestrationName: args.orchestrationName,
    };
  }
  async sendPrompt(args: { sessionId: string; prompt: string }): Promise<AgentResponse> {
    this.prompts.push(args.prompt);
    return { text: 'ok', needsInput: false };
  }
  async getSessionStatus(): Promise<'idle'> {
    return 'idle';
  }
  async stopSession(): Promise<void> {}
}

describe('Runner.resume', () => {
  it('skips completed steps and runs only the first pending step onward', async () => {
    const root = await mkdtemp(join(tmpdir(), 'resume-'));
    const storage = new FsStorage(root);
    const agent = new CountingAgent();

    const fabricated: RunRecord = {
      runId: ulid(),
      orchestrationName: 'demo',
      status: 'running',
      riskClass: 'readonly',
      workHash: HASH('w'),
      policyHash: HASH('p'),
      executorHash: HASH('e'),
      startedAt: '2026-05-06T00:00:00Z',
      steps: [
        { index: 0, prompt: 'step-0', status: 'completed', startedAt: '2026-05-06T00:00:00Z', completedAt: '2026-05-06T00:00:01Z' },
        { index: 1, prompt: 'step-1', status: 'completed', startedAt: '2026-05-06T00:00:02Z', completedAt: '2026-05-06T00:00:03Z' },
        { index: 2, prompt: 'step-2', status: 'pending' },
      ],
      decision,
    };
    await storage.saveRun(fabricated);

    const runner = new Runner({ storage, agent });
    const { record } = await runner.resume({
      orchestrationName: 'demo',
      plan,
    });

    expect(agent.prompts).toEqual(['step-2']);
    expect(record.status).toBe('completed');
    expect(record.steps.map(s => s.status)).toEqual(['completed', 'completed', 'completed']);
  });
});
