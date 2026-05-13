import type { RouteHandler } from '../router.js';
import { json } from '../router.js';

const UPSTREAM_URL = process.env.TOKEN_SMOULDER_CLAUDE_USAGE_URL ?? 'http://127.0.0.1:8787/api/usage';

export const getClaudeUsage: RouteHandler = async (_req, res) => {
  try {
    const resp = await fetch(UPSTREAM_URL, { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) {
      json(res, 502, { error: `upstream ${resp.status}` });
      return;
    }
    const data = await resp.json();
    json(res, 200, data);
  } catch (e) {
    json(res, 502, { error: 'claude usage unavailable', message: e instanceof Error ? e.message : String(e) });
  }
};
