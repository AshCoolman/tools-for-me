export type ExternalSession = {
  pid: number;
  command: string;
  startedAt?: string;
  lastActiveAt?: string;
};

export type ContentionDetector = {
  listExternalSessions(): Promise<ExternalSession[]>;
  isActiveWithin(durationMs: number): Promise<boolean>;
};
