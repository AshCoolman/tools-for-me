import type { RouteHandler } from '../router.js';
import { json } from '../router.js';
import { selectQuotaSource, selectContentionDetector } from '../../wiring.js';

export const getQuota: RouteHandler = async (_req, res) => {
  try {
    const snap = await selectQuotaSource().read();
    json(res, 200, snap);
  } catch (e) {
    json(res, 502, { error: 'quota source unavailable', message: e instanceof Error ? e.message : String(e) });
  }
};

export const getExternal: RouteHandler = async (_req, res) => {
  try {
    const detector = selectContentionDetector();
    const active = await detector.isActiveWithin(30 * 60_000);
    const sessions = await detector.listExternalSessions();
    json(res, 200, { active, sessions });
  } catch (e) {
    json(res, 502, { error: 'contention detector unavailable', message: e instanceof Error ? e.message : String(e) });
  }
};
