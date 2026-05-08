import { input } from '@inquirer/prompts';
import {
  InputTimeoutError,
  type ChannelName,
  type HumanInputChannel,
  type InputRequest,
} from './interface.js';

export type TerminalHumanInputOptions = {
  isTty?: boolean;
};

export class TerminalHumanInput implements HumanInputChannel {
  readonly name: ChannelName = 'terminal';
  private readonly isTty: boolean;

  constructor(opts: TerminalHumanInputOptions = {}) {
    this.isTty = opts.isTty ?? Boolean(process.stdin.isTTY);
  }

  async isAvailable(): Promise<boolean> {
    return this.isTty;
  }

  async request(req: InputRequest): Promise<string> {
    const ask = input({
      message: `[${req.orchestrationName}/${req.runId}] ${req.agentResponse}\nyour answer:`,
    });
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new InputTimeoutError(this.name, req.timeoutMs));
      }, req.timeoutMs);
      ask
        .then(answer => {
          clearTimeout(timer);
          resolve(answer);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
