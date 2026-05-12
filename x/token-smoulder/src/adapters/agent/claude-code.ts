import { spawn } from 'node:child_process';
import { ulid } from 'ulid';
import { z } from 'zod';
import { BoundaryError } from '../../lib/errors.js';
import type {
  AgentClient,
  AgentOwner,
  AgentResponse,
  AgentSession,
  AgentSessionStatus,
} from './interface.js';

const CLI_ENVELOPE = z.object({
  result: z.string(),
  is_error: z.boolean(),
  stop_reason: z.string(),
}).passthrough();

const RESPONSE_SCHEMA = CLI_ENVELOPE.transform((env): AgentResponse => {
  const { result, stop_reason, is_error, ...rest } = env;
  return {
    text: result,
    needsInput: !is_error && stop_reason !== 'end_turn',
    metadata: rest,
  };
});

export type ClaudeCodeAgentOptions = {
  env?: NodeJS.ProcessEnv;
  bin?: string;
};

type SessionState = {
  session: AgentSession;
  status: AgentSessionStatus;
  activeChild?: import('node:child_process').ChildProcess;
};

export class ClaudeCodeAgent implements AgentClient {
  private readonly env: NodeJS.ProcessEnv;
  private readonly bin: string;
  private readonly sessions = new Map<string, SessionState>();

  constructor(opts: ClaudeCodeAgentOptions = {}) {
    this.env = opts.env ?? process.env;
    this.bin = opts.bin ?? process.env.TOKEN_SMOULDER_AGENT_BIN ?? 'claude';
  }

  async startSession(args: { owner: AgentOwner; orchestrationName: string }): Promise<AgentSession> {
    const session: AgentSession = {
      sessionId: ulid(),
      startedAt: new Date().toISOString(),
      owner: args.owner,
      orchestrationName: args.orchestrationName,
    };
    this.sessions.set(session.sessionId, { session, status: 'idle' });
    return session;
  }

  sendPrompt(args: { sessionId: string; prompt: string }): Promise<AgentResponse> {
    const state = this.sessions.get(args.sessionId);
    if (!state) {
      return Promise.reject(
        new BoundaryError({
          endpoint: this.bin,
          args: { sessionId: args.sessionId },
          code: 'unknown_session',
          original: 'session not found',
        }),
      );
    }
    state.status = 'thinking';
    return new Promise<AgentResponse>((resolve, reject) => {
      const child = spawn(
        this.bin,
        ['-p', '--output-format', 'json'],
        {
          env: { ...this.env, TOKEN_SMOULDER_OWNER: 'scheduler' },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      state.activeChild = child;
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => (stdout += d.toString()));
      child.stderr.on('data', d => (stderr += d.toString()));
      child.on('error', err => {
        state.status = 'failed';
        reject(new BoundaryError({
          endpoint: this.bin,
          args: { sessionId: args.sessionId },
          code: 'spawn_error',
          original: err.message,
        }));
      });
      child.on('close', code => {
        if (code !== 0) {
          state.status = 'failed';
          reject(new BoundaryError({
            endpoint: this.bin,
            args: { sessionId: args.sessionId, prompt: args.prompt.slice(0, 200) },
            code: code ?? -1,
            original: stderr.trim() || `exit ${code}`,
          }));
          return;
        }
        const lastLine = stdout.split('\n').filter(Boolean).pop();
        if (!lastLine) {
          state.status = 'failed';
          reject(new BoundaryError({
            endpoint: this.bin,
            args: { sessionId: args.sessionId },
            code: 'empty_stream',
            original: 'agent produced no output',
          }));
          return;
        }
        let parsed: AgentResponse;
        try {
          parsed = RESPONSE_SCHEMA.parse(JSON.parse(lastLine));
        } catch (e) {
          state.status = 'failed';
          reject(new BoundaryError({
            endpoint: this.bin,
            args: { sessionId: args.sessionId, lastLine: lastLine.slice(0, 200) },
            code: 'parse_error',
            original: e instanceof Error ? e.message : String(e),
          }));
          return;
        }
        state.status = parsed.needsInput ? 'awaiting_input' : 'idle';
        resolve(parsed);
      });
      child.stdin.write(args.prompt + '\n');
      child.stdin.end();
    });
  }

  async getSessionStatus(args: { sessionId: string }): Promise<AgentSessionStatus> {
    const state = this.sessions.get(args.sessionId);
    if (!state) return 'failed';
    return state.status;
  }

  async stopSession(args: { sessionId: string; reason: string }): Promise<void> {
    const state = this.sessions.get(args.sessionId);
    if (!state) return;
    if (state.activeChild && !state.activeChild.killed) {
      state.activeChild.kill('SIGTERM');
    }
    state.status = 'completed';
    void args.reason;
  }
}
