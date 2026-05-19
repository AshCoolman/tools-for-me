import { z } from 'zod';

export const RiskClassSchema = z.enum([
  'readonly',
  'repo-local',
  'low-risk-write',
  'networked',
  'destructive',
  'privileged',
]);
export type RiskClass = z.infer<typeof RiskClassSchema>;

export const RunStatusSchema = z.enum([
  'queued',
  'skipped',
  'running',
  'paused',
  'failed',
  'completed',
  'suppressed',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const PromptStepStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);

export const PromptStepStateSchema = z.object({
  index: z.number().int().nonnegative(),
  prompt: z.string(),
  status: PromptStepStatusSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});
export type PromptStepState = z.infer<typeof PromptStepStateSchema>;

export const HashSchema = z.string().regex(/^[0-9a-f]{64}$/, 'must be 64-char hex SHA-256');

export const DispatchDecisionSchema = z.object({
  shouldRun: z.boolean(),
  orchestrationName: z.string().min(1),
  reasons: z.array(z.string()),
  failedReasons: z.array(z.string()),
  riskClass: RiskClassSchema,
  selectedWorkHash: HashSchema,
  evaluatedAt: z.string(),
});
export type DispatchDecision = z.infer<typeof DispatchDecisionSchema>;

export const PredicateResultSchema = z.union([
  z.object({ ok: z.literal(true), reason: z.string() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type PredicateResult = z.infer<typeof PredicateResultSchema>;

export type Predicate = () => Promise<PredicateResult>;

export const QueueStateSchema = z.enum([
  'pending',
  'running',
  'done',
  'cooldown',
  'disabled',
  'failed',
  'suppressed',
]);
export type QueueState = z.infer<typeof QueueStateSchema>;

export const LoopConfigSchema = z.object({
  maxRunsPerDay: z.number().int().min(1),
  cooldownMs: z.number().int().min(60_000),
});
export type LoopConfig = z.infer<typeof LoopConfigSchema>;

export const QueueEntrySchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  lifecycle: z.enum(['once', 'loop']),
  queueState: QueueStateSchema,
  loopConfig: LoopConfigSchema.nullable(),
  dailyRunCount: z.number().int().nonnegative(),
  lastCompletedAt: z.string().nullable(),
  cooldownUntil: z.string().nullable(),
  lastWorkHash: z.string().nullable().optional(),
});
export type QueueEntry = z.infer<typeof QueueEntrySchema>;

export const DailyBudgetSchema = z.object({
  ceiling: z.number().min(0).max(1),
  cycleDurationMs: z.number().int().positive(),
  cycleStartedAt: z.string().nullable(),
  snapshotAtCycleStart: z.number().nullable(),
});
export type DailyBudget = z.infer<typeof DailyBudgetSchema>;

export const GateProximitySchema = z.object({
  name: z.string().min(1),
  passing: z.number().int().nonnegative(),
  blocking: z.array(z.string()),
  position: z.number().int().positive().nullable(),
});
export type GateProximity = z.infer<typeof GateProximitySchema>;

export const QueueFileSchema = z.object({
  entries: z.record(z.string(), QueueEntrySchema),
  budget: DailyBudgetSchema,
});
export type QueueFile = z.infer<typeof QueueFileSchema>;
