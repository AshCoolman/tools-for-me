import type { ContentionDetector } from '../../adapters/contention/interface.js';
import type { Predicate } from '../types.js';

export function noExternalActiveSessionsFor(durationMs: number, detector: ContentionDetector): Predicate {
  return async () => {
    let active: boolean;
    try {
      active = await detector.isActiveWithin(durationMs);
    } catch (e) {
      return {
        ok: false,
        reason: `noExternalActiveSessionsFor(${durationMs}ms): detector error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    if (active) {
      return { ok: false, reason: `noExternalActiveSessionsFor(${durationMs}ms): external session active` };
    }
    return { ok: true, reason: `noExternalActiveSessionsFor(${durationMs}ms)` };
  };
}
