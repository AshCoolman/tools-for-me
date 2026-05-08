import { FsStorage } from '../adapters/storage/fs.js';
import type { EventName } from '../adapters/storage/interface.js';
import { findStateDir } from './orchestration.js';

const KNOWN_TYPES = new Set<EventName>([
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

export type EventsOptions = {
  since?: string;
  type?: string;
  limit?: number;
};

export function parseDuration(spec: string): number {
  const m = spec.match(/^(\d+)(ms|s|m|h)$/);
  if (!m) throw new Error(`invalid --since value: ${spec}`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 'ms':
      return n;
    case 's':
      return n * 1_000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    default:
      throw new Error(`invalid --since unit: ${m[2]}`);
  }
}

export async function eventsInner(opts: EventsOptions) {
  const filter: { sinceMs?: number; type?: EventName } = {};
  if (opts.since !== undefined) filter.sinceMs = parseDuration(opts.since);
  if (opts.type !== undefined) {
    if (!KNOWN_TYPES.has(opts.type as EventName)) {
      return { kind: 'unknown-type' as const, type: opts.type };
    }
    filter.type = opts.type as EventName;
  }
  const stateDir = await findStateDir();
  const storage = new FsStorage(stateDir);
  const events = await storage.readEvents(filter);
  const limit = opts.limit ?? 100;
  return { kind: 'ok' as const, events: events.slice(-limit) };
}

export async function eventsCommand(opts: EventsOptions): Promise<number> {
  const result = await eventsInner(opts);
  if (result.kind === 'unknown-type') {
    process.stderr.write(`events: unknown event type ${result.type}\n`);
    return 2;
  }
  for (const ev of result.events) process.stdout.write(JSON.stringify(ev) + '\n');
  return 0;
}
