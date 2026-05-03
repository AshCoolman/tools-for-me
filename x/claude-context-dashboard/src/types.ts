export type TokenUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  total: number;
};

export type SessionSummary = {
  sessionId: string;
  project: string;
  projectPath: string | null;
  path: string;
  firstSeen: string | null;
  lastSeen: string | null;
  messageCount: number;
  contextTokens: number;
  contextLimit: number;
  contextPercent: number;
  usage: TokenUsage;
  tail: string | null;
  lastPrompt: string | null;
  lastPromptAt: string | null;
  lastReplyAt: string | null;
  compactedAt: string | null;
};

export type UsagePoint = {
  time: string;
  sessionId: string;
  project: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  total: number;
  contextSize: number;
};

export type DashboardData = {
  generatedAt: string;
  sessions: SessionSummary[];
  usage: UsagePoint[];
};
