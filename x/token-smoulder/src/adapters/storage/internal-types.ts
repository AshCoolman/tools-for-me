import { z } from 'zod';
import {
  RiskClassSchema,
  RunStatusSchema,
  PromptStepStateSchema,
  DispatchDecisionSchema,
} from '../../core/types.js';

const HashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const IsoSchema = z.string();

export const RunRecordSchema = z.object({
  runId: z.string().min(1),
  orchestrationName: z.string().min(1),
  status: RunStatusSchema,
  riskClass: RiskClassSchema,
  workHash: HashSchema,
  policyHash: HashSchema,
  executorHash: HashSchema,
  startedAt: IsoSchema,
  endedAt: IsoSchema.optional(),
  steps: z.array(PromptStepStateSchema),
  sessionId: z.string().optional(),
  failureSignature: z.string().optional(),
  decision: DispatchDecisionSchema,
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export const SuppressionRecordSchema = z.object({
  key: z.string().min(1),
  orchestrationName: z.string().min(1),
  workHash: HashSchema,
  policyHash: HashSchema,
  executorHash: HashSchema,
  failingPromptIndex: z.number().int().nonnegative(),
  failureSignature: z.string(),
  firstSeenAt: IsoSchema,
  count: z.number().int().positive(),
  reason: z.string(),
  cooldownExpiresAt: IsoSchema.optional(),
  clearedAt: IsoSchema.optional(),
});
export type SuppressionRecord = z.infer<typeof SuppressionRecordSchema>;

export const LockFileSchema = z.object({
  pid: z.number().int().positive(),
  hostname: z.string(),
  acquiredAt: IsoSchema,
  owner: z.string(),
  scope: z.enum(['global', 'orchestration']),
  orchestrationName: z.string().optional(),
});
export type LockFile = z.infer<typeof LockFileSchema>;

export const AgentSessionSchema = z.object({
  sessionId: z.string().min(1),
  startedAt: IsoSchema,
  owner: z.literal('scheduler'),
  orchestrationName: z.string().min(1),
  pid: z.number().int().positive().optional(),
});
export type AgentSession = z.infer<typeof AgentSessionSchema>;

export const EventNameSchema = z.enum([
  'orchestration_discovered',
  'orchestration_invalid',
  'policy_evaluated',
  'dispatch_allowed',
  'dispatch_blocked',
  'run_started',
  'prompt_started',
  'prompt_completed',
  'input_requested',
  'input_received',
  'run_paused',
  'run_failed',
  'run_completed',
  'run_suppressed',
  'lock_acquired',
  'lock_released',
  'lock_stale',
  'external_session_detected',
  'quota_insufficient',
  'tick_overran',
  'policy_changed',
]);
export type EventName = z.infer<typeof EventNameSchema>;

export const EventSchema = z.object({
  name: EventNameSchema,
  timestamp: IsoSchema,
  orchestrationName: z.string().optional(),
  runId: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});
export type Event = z.infer<typeof EventSchema>;

export type LockScope =
  | { scope: 'global' }
  | { scope: 'orchestration'; orchestrationName: string };
