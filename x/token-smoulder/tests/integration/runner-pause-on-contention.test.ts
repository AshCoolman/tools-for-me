import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { FsStorage } from '../../src/adapters/storage/fs.js';
import { Runner, type ExecutorPlan } from '../../src/core/runner.js';
import { hashContent } from '../../src/lib/hashing.js';
import type { AgentClient, AgentResponse, AgentSession } from '../../src/adapters/agent/interface.js';
import type { ContentionDetector, ExternalSession } from '../../src/adapters/contention/interface.js';

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

class FakeAgent implements AgentClient {
  prompts: string[] = [];
  stopped = 0;
  async startSession(args: { owner: 'scheduler'; orchestrationName: string }): Promise<AgentSession> {
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
  async stopSession(): Promise<void> {
    this.stopped++;
  }
}

const offendingSessions: ExternalSession[] = [
  { pid: 4242, command: 'claude --some-flag' },
  { pid: 4243, command: 'claude' },
];

class FakeContention implements ContentionDetector {
  private callCount = 0;
  constructor(private readonly busyAfterCalls: number) {}
  async listExternalSessions(): Promise<ExternalSession[]> {
    return offendingSessions;
  }
  async isActiveWithin(): Promise<boolean> {
    this.callCount++;
    return this.callCount > this.busyAfterCalls;
  }
}

describe('Runner — pause on between-step contention', () => {
  it('emits external_session_detected then run_paused with offending pids; stops session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pause-'));
    const storage = new FsStorage(root);
    const agent = new FakeAgent();
    const contention = new FakeContention(/* busyAfterCalls */ 1);

    const runner = new Runner({
      storage,
      agent,
      contention,
      contentionThresholdMs: 30 * 60_000,
    });

    await runner.execute({
      orchestrationName: 'demo',
      workHash: HASH('w'),
      policyHash: HASH('p'),
      executorHash: HASH('e'),
      decision,
      plan,
    });

    const events = await storage.readEvents();
    const names = events.map(e => e.name);

    const detectedIdx = names.indexOf('external_session_detected');
    const pausedIdx = names.indexOf('run_paused');
    expect(detectedIdx).toBeGreaterThanOrEqual(0);
    expect(pausedIdx).toBeGreaterThan(detectedIdx);

    const detected = events[detectedIdx]!;
    const sessionsPayload = detected.payload?.sessions as ExternalSession[];
    expect(sessionsPayload.map(s => s.pid)).toEqual([4242, 4243]);

    const paused = events[pausedIdx]!;
    expect(paused.payload?.reason).toBe('external_session_detected');
    expect(paused.payload?.sessions as ExternalSession[]).toBeDefined();
    expect((paused.payload?.sessions as ExternalSession[]).map(s => s.pid)).toEqual([4242, 4243]);

    expect(agent.stopped).toBe(1);
    expect(agent.prompts).toEqual(['step-0']);
  });
});
