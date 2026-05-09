import type { RouteHandler } from '../router.js';
import { json, readJson } from '../router.js';
import { loadPrefs, savePrefs } from '../prefs.js';

export const getPrefs: RouteHandler = async (_req, res) => {
  const prefs = await loadPrefs();
  json(res, 200, prefs);
};

export const putPrefs: RouteHandler = async (req, res) => {
  const body = await readJson(req);
  if (typeof body !== 'object' || body === null) {
    json(res, 400, { error: 'body must be a JSON object' });
    return;
  }
  await savePrefs(body as Record<string, unknown>);
  json(res, 200, body);
};
