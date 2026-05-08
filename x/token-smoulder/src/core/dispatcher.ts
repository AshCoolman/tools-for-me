import { ulid } from 'ulid';
import type { Storage } from '../adapters/storage/interface.js';
import { findActive as findActiveSuppression } from './suppression.js';
import type { DispatchDecision, Predicate, RiskClass } from './types.js';

export type GateSet = {
  capacity: Predicate;
  contention: Predicate;
  value: Predicate;
  risk: Predicate;
};

export type CapacityShortfall = {
  scope: 'session' | 'week';
  remaining: number;
  threshold: number;
};

export type DispatchInput = {
  orchestrationName: string;
  workHash: string;
  policyHash: string;
  executorHash: string;
  riskClass: RiskClass;
  storageRoot: string;
};

export type DispatcherOptions = {
  storage: Storage;
  gates: GateSet;
  capacityContext?: () => Promise<CapacityShortfall[]>;
};

export class Dispatcher {
  constructor(private readonly opts: DispatcherOptions) {}

  async evaluate(input: DispatchInput): Promise<DispatchDecision> {
    const { storage, gates } = this.opts;

    const suppression = await findActiveSuppression(storage, {
      orchestrationName: input.orchestrationName,
      workHash: input.workHash,
      policyHash: input.policyHash,
      executorHash: input.executorHash,
    });
    if (suppression) {
      const evaluatedAt = new Date().toISOString();
      const reason = `run_suppressed: ${suppression.reason} (key=${suppression.key.slice(0, 8)})`;
      const decision: DispatchDecision = {
        shouldRun: false,
        orchestrationName: input.orchestrationName,
        reasons: [],
        failedReasons: [reason],
        riskClass: input.riskClass,
        selectedWorkHash: input.workHash,
        evaluatedAt,
      };
      await storage.appendEvent({
        name: 'run_suppressed',
        timestamp: evaluatedAt,
        orchestrationName: input.orchestrationName,
        payload: {
          suppressionKey: suppression.key,
          reason: suppression.reason,
        },
      });
      return decision;
    }

    const previous = await storage.loadLatestRun(input.orchestrationName).catch(() => null);
    if (previous && previous.policyHash !== input.policyHash) {
      await storage.appendEvent({
        name: 'policy_changed',
        timestamp: new Date().toISOString(),
        orchestrationName: input.orchestrationName,
        payload: { previousHash: previous.policyHash, currentHash: input.policyHash },
      });
    }

    const order: Array<['capacity' | 'contention' | 'value' | 'risk', Predicate]> = [
      ['capacity', gates.capacity],
      ['contention', gates.contention],
      ['value', gates.value],
      ['risk', gates.risk],
    ];

    const reasons: string[] = [];
    const failedReasons: string[] = [];
    let capacityFailed = false;

    for (const [name, p] of order) {
      const r = await p();
      if (r.ok) {
        reasons.push(r.reason);
      } else {
        failedReasons.push(r.reason);
        if (name === 'capacity') capacityFailed = true;
      }
    }

    const decision: DispatchDecision = {
      shouldRun: failedReasons.length === 0,
      orchestrationName: input.orchestrationName,
      reasons,
      failedReasons,
      riskClass: input.riskClass,
      selectedWorkHash: input.workHash,
      evaluatedAt: new Date().toISOString(),
    };

    await storage.appendEvent({
      name: 'policy_evaluated',
      timestamp: decision.evaluatedAt,
      orchestrationName: input.orchestrationName,
      payload: { decision },
    });

    if (capacityFailed && this.opts.capacityContext) {
      const shortfalls = await this.opts.capacityContext().catch(() => []);
      for (const sf of shortfalls) {
        await storage.appendEvent({
          name: 'quota_insufficient',
          timestamp: new Date().toISOString(),
          orchestrationName: input.orchestrationName,
          payload: { scope: sf.scope, remaining: sf.remaining, threshold: sf.threshold },
        });
      }
    }

    const decisionId = ulid();
    if (decision.shouldRun) {
      await storage.appendEvent({
        name: 'dispatch_allowed',
        timestamp: new Date().toISOString(),
        orchestrationName: input.orchestrationName,
        payload: { decisionId, reasons, failedReasons },
      });
    } else {
      await storage.appendEvent({
        name: 'dispatch_blocked',
        timestamp: new Date().toISOString(),
        orchestrationName: input.orchestrationName,
        payload: { decisionId, reasons, failedReasons },
      });
    }

    return decision;
  }
}
