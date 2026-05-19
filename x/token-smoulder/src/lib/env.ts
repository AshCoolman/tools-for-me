function intFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`${key} must be a non-negative integer, got: ${raw}`);
  }
  return n;
}

function floatFromEnv(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${key} must be a number between ${min} and ${max}, got: ${raw}`);
  }
  return n;
}

function stringFromEnv(key: string, fallback: string): string {
  const raw = process.env[key];
  return raw === undefined || raw === '' ? fallback : raw;
}

export const env = {
  tickMs: () => intFromEnv('TOKEN_SMOULDER_TICK_MS', 60_000),
  tickOverrunMs: () => intFromEnv('TOKEN_SMOULDER_TICK_OVERRUN_MS', 30_000),
  lockMaxAgeMs: () => intFromEnv('TOKEN_SMOULDER_LOCK_MAX_AGE_MS', 86_400_000),
  inputTimeoutMs: () => intFromEnv('TOKEN_SMOULDER_INPUT_TIMEOUT_MS', 1_800_000),
  shutdownGraceMs: () => intFromEnv('TOKEN_SMOULDER_SHUTDOWN_GRACE_MS', 60_000),
  owner: () => stringFromEnv('TOKEN_SMOULDER_OWNER', ''),
  budgetCeiling: () => floatFromEnv('TOKEN_SMOULDER_BUDGET_CEILING', 0.5, 0, 1),
  cycleDurationMs: () => intFromEnv('TOKEN_SMOULDER_CYCLE_DURATION_MS', 86_400_000),
};
