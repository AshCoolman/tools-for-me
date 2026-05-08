import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { FsStorage } from '../../src/adapters/storage/fs.js';
import { Runner, type ExecutorPlan } from '../../src/core/runner.js';
import { hashContent } from '../../src/lib/hashing.js';
import type { AgentClient, AgentResponse, AgentSession } from '../../src/adapters/agent/interface.js';
import type {
  HumanInputChannel,
  InputRequest,
} from '../../src/adapters/input/interface.js';

const HASH = (s: string) => hashContent(s);

const plan: ExecutorPlan = {
  riskClass: 'readonly',
  objective: 'o',
  context: 'c',
  constraints: 'k',
  promptFlow: ['step-0', 'step-1'],
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

class NeedsInputAgent implements AgentClient {
  prompts: string[] = [];
  private respondedNeedsInput = false;
  async startSession(args: {
    owner: 'scheduler';
    orchestrationName: string;
  }): Promise<AgentSession> {
    return {
      sessionId: ulid(),
      startedAt: new Date().toISOString(),
      owner: args.owner,
      orchestrationName: args.orchestrationName,
    };
  }
  async sendPrompt(args: { sessionId: string; prompt: string }): Promise<AgentResponse> {
    this.prompts.push(args.prompt);
    if (!this.respondedNeedsInput) {
      this.respondedNeedsInput = true;
      return { text: 'need a clarification', needsInput: true };
    }
    return { text: 'ok', needsInput: false };
  }
  async getSessionStatus(): Promise<'idle'> {
    return 'idle';
  }
  async stopSession(): Promise<void> {}
}

class StubChannel implements HumanInputChannel {
  readonly name = 'terminal' as const;
  requested: InputRequest | null = null;
  async isAvailable(): Promise<boolean> {
    return true;
  }
  async request(input: InputRequest): Promise<string> {
    this.requested = input;
    return 'human-said-this';
  }
}

describe('Runner — human-in-the-loop', () => {
  it('emits input_requested + input_received and feeds answer as next prompt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hil-'));
    const storage = new FsStorage(root);
    const agent = new NeedsInputAgent();
    const channel = new StubChannel();

    const runner = new Runner({
      storage,
      agent,
      humanInput: channel,
      humanInputTimeoutMs: 5_000,
    });

    await runner.execute({
      orchestrationName: 'demo',
      workHash: HASH('w'),
      policyHash: HASH('p'),
      executorHash: HASH('e'),
      decision,
      plan,
    });

    expect(channel.requested?.agentResponse).toBe('need a clarification');
    expect(agent.prompts).toContain('human-said-this');

    const events = await storage.readEvents();
    const names = events.map(e => e.name);
    const reqIdx = names.indexOf('input_requested');
    const recvIdx = names.indexOf('input_received');
    expect(reqIdx).toBeGreaterThanOrEqual(0);
    expect(recvIdx).toBeGreaterThan(reqIdx);
  });
});
