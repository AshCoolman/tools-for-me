import { createHash } from 'node:crypto';
import type { Storage } from '../adapters/storage/interface.js';
import type { SuppressionRecord } from '../adapters/storage/internal-types.js';

export type SuppressionInput = {
  orchestrationName: string;
  workHash: string;
  policyHash: string;
  executorHash: string;
  failingPromptIndex: number;
  failureSignature: string;
};

export type SuppressionMatch = {
  orchestrationName: string;
  workHash: string;
  policyHash: string;
  executorHash: string;
};

export function deriveSuppressionKey(input: SuppressionInput): string {
  const canonical = JSON.stringify({
    executorHash: input.executorHash,
    failingPromptIndex: input.failingPromptIndex,
    failureSignature: input.failureSignature,
    orchestrationName: input.orchestrationName,
    policyHash: input.policyHash,
    workHash: input.workHash,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function normalizeFailureSignature(message: string): string {
  return message
    .replace(/\/[^\s:]+/g, '<path>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<ts>')
    .replace(/\b\d{6,}\b/g, '<num>')
    .trim();
}

export async function findActive(
  storage: Storage,
  match: SuppressionMatch,
): Promise<SuppressionRecord | null> {
  const all = await storage.listActiveSuppressions();
  for (const r of all) {
    if (
      r.orchestrationName === match.orchestrationName &&
      r.workHash === match.workHash &&
      r.policyHash === match.policyHash &&
      r.executorHash === match.executorHash
    ) {
      return r;
    }
  }
  return null;
}

export async function recordFailure(
  storage: Storage,
  input: SuppressionInput,
): Promise<SuppressionRecord> {
  const key = deriveSuppressionKey(input);
  const existing = await storage.loadSuppression(key);
  const now = new Date().toISOString();

  if (existing && existing.clearedAt === undefined) {
    const next: SuppressionRecord = {
      ...existing,
      count: existing.count + 1,
      reason:
        existing.count + 1 >= 2
          ? 'second identical failure'
          : 'first failure recorded',
    };
    await storage.saveSuppression(next);
    return next;
  }

  const fresh: SuppressionRecord = {
    key,
    orchestrationName: input.orchestrationName,
    workHash: input.workHash,
    policyHash: input.policyHash,
    executorHash: input.executorHash,
    failingPromptIndex: input.failingPromptIndex,
    failureSignature: input.failureSignature,
    firstSeenAt: now,
    count: 1,
    reason: 'first failure recorded',
  };
  await storage.saveSuppression(fresh);
  return fresh;
}
