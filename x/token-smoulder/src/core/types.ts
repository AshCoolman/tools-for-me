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
