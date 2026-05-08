import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { BoundaryError } from '../../lib/errors.js';
import {
  type ChannelName,
  type HumanInputChannel,
  type InputRequest,
} from './interface.js';

export type AgentRemoteHumanInputOptions = {
  bin?: string;
  env?: NodeJS.ProcessEnv;
};

export class AgentRemoteHumanInput implements HumanInputChannel {
  readonly name: ChannelName = 'agent-remote';
  private readonly bin: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(opts: AgentRemoteHumanInputOptions = {}) {
    this.bin = opts.bin ?? 'agent-remote';
    this.env = opts.env ?? process.env;
  }

  async isAvailable(): Promise<boolean> {
    const pathRaw = this.env.PATH ?? '';
    if (pathRaw === '') return false;
    for (const dir of pathRaw.split(':')) {
      if (dir === '') continue;
      const candidate = join(dir, this.bin);
      const ok = await stat(candidate)
        .then(s => s.isFile())
        .catch(() => false);
      if (ok) return true;
    }
    return false;
  }

  request(req: InputRequest): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(this.bin, [], {
        env: this.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => (stdout += d.toString()));
      child.stderr.on('data', d => (stderr += d.toString()));
      child.on('error', err => {
        reject(
          new BoundaryError({
            endpoint: this.bin,
            args: { runId: req.runId },
            code: 'spawn_error',
            original: err.message,
          }),
        );
      });
      child.on('close', code => {
        if (code !== 0) {
          reject(
            new BoundaryError({
              endpoint: this.bin,
              args: { runId: req.runId },
              code: code ?? -1,
              original: stderr.trim() || `exit ${code}`,
            }),
          );
          return;
        }
        resolve(stdout);
      });
      child.stdin.write(
        JSON.stringify({
          orchestrationName: req.orchestrationName,
          runId: req.runId,
          agentResponse: req.agentResponse,
          timeoutMs: req.timeoutMs,
        }) + '\n',
      );
      child.stdin.end();
    });
  }
}
