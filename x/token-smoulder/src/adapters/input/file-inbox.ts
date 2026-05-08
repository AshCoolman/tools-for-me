import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  InputTimeoutError,
  type ChannelName,
  type HumanInputChannel,
  type InputRequest,
} from './interface.js';

export type FileInboxHumanInputOptions = {
  stateDir: string;
  pollMs?: number;
};

export class FileInboxHumanInput implements HumanInputChannel {
  readonly name: ChannelName = 'file-inbox';
  private readonly inboxDir: string;
  private readonly pollMs: number;

  constructor(opts: FileInboxHumanInputOptions) {
    this.inboxDir = join(opts.stateDir, 'inbox');
    this.pollMs = opts.pollMs ?? 2_000;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async request(req: InputRequest): Promise<string> {
    await mkdir(this.inboxDir, { recursive: true });
    const reqPath = join(this.inboxDir, `${req.runId}.req`);
    const resPath = join(this.inboxDir, `${req.runId}.res`);
    const payload = {
      orchestrationName: req.orchestrationName,
      runId: req.runId,
      agentResponse: req.agentResponse,
      timeoutMs: req.timeoutMs,
      requestedAt: new Date().toISOString(),
    };
    await writeFile(reqPath, JSON.stringify(payload, null, 2));

    const deadline = Date.now() + req.timeoutMs;
    while (Date.now() < deadline) {
      const exists = await stat(resPath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        return readFile(resPath, 'utf8');
      }
      await new Promise<void>(resolve => setTimeout(resolve, this.pollMs));
    }
    throw new InputTimeoutError(this.name, req.timeoutMs);
  }
}
