// Contract: shared internal types referenced by storage.ts and other contracts.
// These mirror the persisted on-disk shapes documented in data-model.md.

export type RiskClass =
  | 'readonly'
  | 'repo-local'
  | 'low-risk-write'
  | 'networked'
  | 'destructive'
  | 'privileged';

export type RunStatus =
  | 'queued'
  | 'skipped'
  | 'running'
  | 'paused'
  | 'failed'
  | 'completed'
  | 'suppressed';

export type PromptStepState = {
  index: number;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export type DispatchDecision = {
  shouldRun: boolean;
  orchestrationName: string;
  reasons: string[];
  failedReasons: string[];
  riskClass: RiskClass;
  selectedWorkHash: string;
  evaluatedAt: string;
};

export type RunRecord = {
  runId: string;
  orchestrationName: string;
  status: RunStatus;
  riskClass: RiskClass;
  workHash: string;
  policyHash: string;
  executorHash: string;
  startedAt: string;
  endedAt?: string;
  steps: PromptStepState[];
  sessionId?: string;
  failureSignature?: string;
  decision: DispatchDecision;
};

export type SuppressionRecord = {
  key: string;
  orchestrationName: string;
  workHash: string;
  policyHash: string;
  executorHash: string;
  failingPromptIndex: number;
  failureSignature: string;
  firstSeenAt: string;
  count: number;
  reason: string;
  cooldownExpiresAt?: string;
  clearedAt?: string;
};

export type LockFile = {
  pid: number;
  hostname: string;
  acquiredAt: string;
  owner: 'scheduler' | string;
  scope: 'global' | 'orchestration';
  orchestrationName?: string;
};

export type AgentSession = {
  sessionId: string;
  startedAt: string;
  owner: 'scheduler';
  orchestrationName: string;
  pid?: number;
};
