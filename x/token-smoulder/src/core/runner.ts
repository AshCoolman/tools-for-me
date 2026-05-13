import { ulid } from 'ulid';
import type { AgentClient } from '../adapters/agent/interface.js';
import type { Storage, LockScope } from '../adapters/storage/interface.js';
import type { ContentionDetector, ExternalSession } from '../adapters/contention/interface.js';
import type { HumanInputChannel } from '../adapters/input/interface.js';
import type { DispatchDecision, PromptStepState, RiskClass } from './types.js';
import type { RunRecord } from '../adapters/storage/internal-types.js';
import type { Work } from './work-parser.js';
export { list } from './work-parser.js';
import { isPidAlive, releaseLock } from './locks.js';
import { normalizeFailureSignature, recordFailure } from './suppression.js';
import { loadPlaybook, matchError, interpretError } from './playbook.js';

export type ExecutorPlan = {
  riskClass: RiskClass;
  objective: string;
  context: string;
  constraints: string;
  promptFlow: string[];
  stopConditions: string[];
  agentFlags?: string[];
};

export type ExecutorContext = { work: Work };
export type Executor = (ctx: ExecutorContext) => ExecutorPlan;

export function executeAgentWork(fn: Executor): Executor {
  return fn;
}

export type RunnerOptions = {
  storage: Storage;
  agent: AgentClient;
  stateDir?: string;
  contention?: ContentionDetector;
  contentionThresholdMs?: number;
  lockScope?: LockScope;
  humanInput?: HumanInputChannel;
  humanInputTimeoutMs?: number;
};

export type RunInput = {
  orchestrationName: string;
  workHash: string;
  policyHash: string;
  executorHash: string;
  decision: DispatchDecision;
  plan: ExecutorPlan;
};

export type ResumeInput = {
  orchestrationName: string;
  plan: ExecutorPlan;
};

export type RunnerResult = { record: RunRecord };

export class RunKilledError extends Error {
  constructor() { super('killed by user'); this.name = 'RunKilledError'; }
}

export class Runner {
  private _aborted = false;
  private _sessionId?: string;

  constructor(private readonly opts: RunnerOptions) {}

  abort(): void {
    this._aborted = true;
    if (this._sessionId) {
      this.opts.agent.stopSession({ sessionId: this._sessionId, reason: 'killed' }).catch(() => {});
    }
  }

  async execute(input: RunInput): Promise<RunnerResult> {
    const { storage, agent } = this.opts;
    const runId = ulid();
    const startedAt = new Date().toISOString();

    const steps: PromptStepState[] = input.plan.promptFlow.map((p, i) => ({
      index: i,
      prompt: p,
      status: 'pending',
    }));

    const record: RunRecord = {
      runId,
      orchestrationName: input.orchestrationName,
      status: 'running',
      riskClass: input.plan.riskClass,
      workHash: input.workHash,
      policyHash: input.policyHash,
      executorHash: input.executorHash,
      startedAt,
      steps,
      decision: input.decision,
    };
    await storage.saveRun(record);

    await storage.appendEvent({
      name: 'run_started',
      timestamp: startedAt,
      orchestrationName: input.orchestrationName,
      runId,
      payload: { runId, decision: input.decision },
    });

    const session = await agent.startSession({
      owner: 'scheduler',
      orchestrationName: input.orchestrationName,
    });
    record.sessionId = session.sessionId;
    await storage.saveSession(session);

    return this.runSteps(record, 0, session.sessionId, input.plan.agentFlags);
  }

  async resume(input: ResumeInput): Promise<RunnerResult> {
    const { storage, agent } = this.opts;
    const previous = await storage.loadLatestRun(input.orchestrationName);
    if (!previous) {
      throw new Error(`no previous run for ${input.orchestrationName}`);
    }
    if (previous.status === 'completed') {
      return { record: previous };
    }
    if (previous.steps.length !== input.plan.promptFlow.length) {
      throw new Error(
        `plan promptFlow length (${input.plan.promptFlow.length}) does not match saved record steps length (${previous.steps.length})`,
      );
    }

    const fromIdx = previous.steps.findIndex(s => s.status !== 'completed' && s.status !== 'skipped');
    if (fromIdx === -1) {
      previous.status = 'completed';
      previous.endedAt = new Date().toISOString();
      await storage.saveRun(previous);
      return { record: previous };
    }

    let sessionId: string | undefined;
    if (previous.sessionId) {
      const existing = await storage.loadSession(previous.sessionId);
      if (existing && existing.pid !== undefined && isPidAlive(existing.pid)) {
        sessionId = existing.sessionId;
      }
    }
    if (sessionId === undefined) {
      const fresh = await agent.startSession({
        owner: 'scheduler',
        orchestrationName: input.orchestrationName,
      });
      previous.sessionId = fresh.sessionId;
      await storage.saveSession(fresh);
      sessionId = fresh.sessionId;
    }

    previous.status = 'running';
    await storage.saveRun(previous);

    return this.runSteps(previous, fromIdx, sessionId, input.plan.agentFlags);
  }

  private async runSteps(
    record: RunRecord,
    fromIdx: number,
    sessionId: string,
    agentFlags?: string[],
  ): Promise<RunnerResult> {
    const { storage, agent, contention, contentionThresholdMs, lockScope } = this.opts;
    const { steps } = record;
    this._sessionId = sessionId;

    try {
      for (let i = fromIdx; i < steps.length; i++) {
        if (this._aborted) {
          for (let j = i; j < steps.length; j++) steps[j]!.status = 'skipped';
          record.status = 'failed';
          record.endedAt = new Date().toISOString();
          record.failureSignature = 'killed by user';
          await storage.saveRun(record);
          await storage.appendEvent({
            name: 'run_failed',
            timestamp: record.endedAt,
            orchestrationName: record.orchestrationName,
            runId: record.runId,
            payload: { runId: record.runId, reason: 'killed by user', failureSignature: 'killed by user' },
          });
          throw new RunKilledError();
        }

        const step = steps[i]!;

        if (contention && contentionThresholdMs !== undefined) {
          const busy = await contention.isActiveWithin(contentionThresholdMs);
          if (busy) {
            const sessions: ExternalSession[] = await contention.listExternalSessions();
            const detectedAt = new Date().toISOString();
            await storage.appendEvent({
              name: 'external_session_detected',
              timestamp: detectedAt,
              orchestrationName: record.orchestrationName,
              runId: record.runId,
              payload: { sessions },
            });
            record.status = 'paused';
            record.endedAt = detectedAt;
            await storage.saveRun(record);
            await storage.appendEvent({
              name: 'run_paused',
              timestamp: detectedAt,
              orchestrationName: record.orchestrationName,
              runId: record.runId,
              payload: {
                runId: record.runId,
                reason: 'external_session_detected',
                sessions,
              },
            });
            await agent
              .stopSession({ sessionId, reason: 'external_session_detected' })
              .catch(() => undefined);
            if (lockScope) {
              await releaseLock(storage, lockScope).catch(() => undefined);
            }
            return { record };
          }
        }

        const stepStart = new Date().toISOString();
        step.status = 'running';
        step.startedAt = stepStart;
        await storage.saveRun(record);
        await storage.appendEvent({
          name: 'prompt_started',
          timestamp: stepStart,
          orchestrationName: record.orchestrationName,
          runId: record.runId,
          payload: { runId: record.runId, stepIndex: i, prompt: step.prompt },
        });

        const t0 = Date.now();
        try {
          const resp = await agent.sendPrompt({ sessionId, prompt: step.prompt, agentFlags });
          step.status = 'completed';
          step.completedAt = new Date().toISOString();
          await storage.saveRun(record);
          await storage.appendEvent({
            name: 'prompt_completed',
            timestamp: step.completedAt,
            orchestrationName: record.orchestrationName,
            runId: record.runId,
            payload: {
              runId: record.runId,
              stepIndex: i,
              prompt: step.prompt,
              durationMs: Date.now() - t0,
              needsInput: resp.needsInput,
            },
          });

          if (resp.needsInput && this.opts.humanInput) {
            const channel = this.opts.humanInput;
            const timeoutMs = this.opts.humanInputTimeoutMs ?? 30 * 60_000;
            record.status = 'paused';
            await storage.saveRun(record);
            await storage.appendEvent({
              name: 'input_requested',
              timestamp: new Date().toISOString(),
              orchestrationName: record.orchestrationName,
              runId: record.runId,
              payload: { runId: record.runId, channel: channel.name, timeoutMs },
            });
            const answer = await channel.request({
              orchestrationName: record.orchestrationName,
              runId: record.runId,
              agentResponse: resp.text,
              timeoutMs,
            });
            await storage.appendEvent({
              name: 'input_received',
              timestamp: new Date().toISOString(),
              orchestrationName: record.orchestrationName,
              runId: record.runId,
              payload: { runId: record.runId, channel: channel.name, timeoutMs },
            });
            record.status = 'running';
            await storage.saveRun(record);
            await agent.sendPrompt({ sessionId, prompt: answer });
          }
        } catch (e) {
          step.status = 'failed';
          if (this._aborted) {
            step.error = 'killed by user';
            record.status = 'failed';
            record.endedAt = new Date().toISOString();
            record.failureSignature = 'killed by user';
            await storage.saveRun(record);
            await storage.appendEvent({
              name: 'run_failed',
              timestamp: record.endedAt,
              orchestrationName: record.orchestrationName,
              runId: record.runId,
              payload: { runId: record.runId, reason: 'killed by user', failureSignature: 'killed by user' },
            });
            throw new RunKilledError();
          }
          step.error = e instanceof Error ? e.message : String(e);
          const failureSignature = normalizeFailureSignature(step.error);
          record.status = 'failed';
          record.endedAt = new Date().toISOString();
          record.failureSignature = failureSignature;
          await storage.saveRun(record);
          await storage.appendEvent({
            name: 'run_failed',
            timestamp: record.endedAt,
            orchestrationName: record.orchestrationName,
            runId: record.runId,
            payload: {
              runId: record.runId,
              reason: step.error,
              failureSignature,
            },
          });
          await recordFailure(storage, {
            orchestrationName: record.orchestrationName,
            workHash: record.workHash,
            policyHash: record.policyHash,
            executorHash: record.executorHash,
            failingPromptIndex: i,
            failureSignature,
          });
          if (this.opts.stateDir) {
            try {
              const rules = await loadPlaybook(this.opts.stateDir);
              const matched = matchError(step.error, rules);
              if (matched) {
                matched.hits++;
                const { savePlaybook } = await import('./playbook.js');
                await savePlaybook(this.opts.stateDir, rules);
                record.interpretation = {
                  ruleId: matched.id,
                  explanation: matched.explanation,
                  remediation: matched.remediation,
                  status: 'matched',
                };
              } else {
                record.interpretation = { ruleId: null, status: 'pending' };
                const sd = this.opts.stateDir;
                const errorText = step.error;
                const failedStep = step;
                void interpretError(sd, {
                  error: errorText,
                  orchestrationName: record.orchestrationName,
                  gateResults: [
                    ...record.decision.reasons,
                    ...record.decision.failedReasons,
                  ],
                  stepPrompt: failedStep.prompt,
                }).then(async (newRule) => {
                  if (newRule) {
                    record.interpretation = {
                      ruleId: newRule.id,
                      explanation: newRule.explanation,
                      remediation: newRule.remediation,
                      status: 'matched',
                    };
                    await storage.saveRun(record).catch(() => {});
                  }
                }).catch(() => {});
              }
              await storage.saveRun(record);
            } catch {
              // playbook matching is best-effort
            }
          }
          throw e;
        }
      }

      record.status = 'completed';
      record.endedAt = new Date().toISOString();
      await storage.saveRun(record);
      await storage.appendEvent({
        name: 'run_completed',
        timestamp: record.endedAt,
        orchestrationName: record.orchestrationName,
        runId: record.runId,
        payload: { runId: record.runId, reason: 'all steps completed' },
      });
      return { record };
    } finally {
      if (record.status !== 'paused') {
        await agent.stopSession({ sessionId, reason: record.status }).catch(() => undefined);
      }
    }
  }
}
