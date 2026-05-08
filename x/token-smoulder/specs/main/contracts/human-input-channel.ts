// Contract: HumanInputChannel
// Resolves a request for human input from a paused run. The dispatcher selects
// one channel at startup; mid-request failure is loud, not a silent fall-through.

export type InputRequest = {
  orchestrationName: string;
  runId: string;
  agentResponse: string;
  timeoutMs: number;
};

export type HumanInputChannel = {
  // Channel name for logs and channel-selection diagnostics.
  readonly name: 'agent-remote' | 'terminal' | 'file-inbox';

  // True iff the channel is usable in the current process environment.
  isAvailable(): Promise<boolean>;

  // Resolve with the human's answer. Reject with TimeoutError on timeout, or
  // BoundaryError on transport failure. MUST NOT return a synthetic answer.
  request(input: InputRequest): Promise<string>;
};
