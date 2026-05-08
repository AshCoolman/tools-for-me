export type ChannelName = 'agent-remote' | 'terminal' | 'file-inbox';

export type InputRequest = {
  orchestrationName: string;
  runId: string;
  agentResponse: string;
  timeoutMs: number;
};

export type HumanInputChannel = {
  readonly name: ChannelName;
  isAvailable(): Promise<boolean>;
  request(input: InputRequest): Promise<string>;
};

export class InputTimeoutError extends Error {
  readonly channel: ChannelName;
  readonly timeoutMs: number;
  constructor(channel: ChannelName, timeoutMs: number) {
    super(`input timeout: ${channel} (${timeoutMs}ms)`);
    this.name = 'InputTimeoutError';
    this.channel = channel;
    this.timeoutMs = timeoutMs;
  }
}
