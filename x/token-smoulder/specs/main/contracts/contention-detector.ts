// Contract: ContentionDetector
// Determines whether automation would interfere with human-driven activity.
// Implementations MUST exclude scheduler-owned sessions (env TOKEN_SMOULDER_OWNER=scheduler).

export type ExternalSession = {
  pid: number;
  command: string;
  startedAt?: string;
  lastActiveAt?: string;
};

export type ContentionDetector = {
  // List currently-active external sessions (excluding scheduler-owned).
  listExternalSessions(): Promise<ExternalSession[]>;

  // True if any external session was active within the duration window.
  // Conservative failure: on detection error, return true (treat as active).
  isActiveWithin(durationMs: number): Promise<boolean>;
};
