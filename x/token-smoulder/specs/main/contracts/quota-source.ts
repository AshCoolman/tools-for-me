// Contract: QuotaSource
// Reads remaining quota for the configured agent. Implementations adapt the
// existing CLI tools (claude-token-usage-fragile, claude-token-simple).

export type QuotaScope = 'session' | 'week';

export type QuotaSnapshot = {
  session: number; // 0..1 fraction remaining
  week: number;    // 0..1 fraction remaining
  sampledAt: string;
  source: string;  // identifier for the concrete adapter
};

export type QuotaSource = {
  // MUST throw BoundaryError if the underlying tool is missing, errors, or
  // returns malformed output. MUST NOT return a synthetic 100% snapshot on failure.
  read(): Promise<QuotaSnapshot>;
};
