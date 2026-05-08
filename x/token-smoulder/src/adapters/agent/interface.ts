export type AgentOwner = 'scheduler';

export type AgentSession = {
  sessionId: string;
  startedAt: string;
  owner: AgentOwner;
  orchestrationName: string;
  pid?: number;
};

export type AgentResponse = {
  text: string;
  needsInput: boolean;
  metadata?: Record<string, unknown>;
};

export type AgentSessionStatus =
  | 'starting'
  | 'idle'
  | 'thinking'
  | 'awaiting_input'
  | 'completed'
  | 'failed';

export type AgentClient = {
  startSession(args: { owner: AgentOwner; orchestrationName: string }): Promise<AgentSession>;
  sendPrompt(args: { sessionId: string; prompt: string }): Promise<AgentResponse>;
  getSessionStatus(args: { sessionId: string }): Promise<AgentSessionStatus>;
  stopSession(args: { sessionId: string; reason: string }): Promise<void>;
};
