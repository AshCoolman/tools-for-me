import type { RouteHandler } from '../router.js';
import { json, readJson } from '../router.js';
import { listInner } from '../../list.js';
import { stateInner } from '../../state.js';
import { runInner } from '../../run.js';
import { unlockInner } from '../../unlock.js';
import { clearSuppressionInner } from '../../clear-suppression.js';
import { suppressionsInner } from '../../suppressions.js';
import { checkDecision } from '../../check.js';
import { FsStorage } from '../../../adapters/storage/fs.js';
import { findStateDir } from '../../orchestration.js';

export const getUnits: RouteHandler = async (_req, res) => {
  const result = await listInner();
  json(res, 200, result);
};

export const getUnitState: RouteHandler = async (_req, res, params) => {
  const name = params['name'] ?? '';
  const record = await stateInner(name);
  if (record === null) {
    json(res, 404, { error: `no run record for ${name}` });
    return;
  }
  json(res, 200, record);
};

export const postUnitRun: RouteHandler = async (_req, res, params) => {
  const name = params['name'] ?? '';
  const result = await runInner(name, { section: 'Objective' });
  switch (result.kind) {
    case 'completed':
      json(res, 200, { status: 'completed' });
      return;
    case 'gate-failed':
      json(res, 200, { status: 'gate-failed', decision: result.decision });
      return;
    case 'lock-contention':
      json(res, 409, { error: 'lock contention', message: result.message });
      return;
    case 'dry-run':
      json(res, 200, { status: 'dry-run', decision: result.decision });
      return;
    case 'boundary-error':
      json(res, 502, { error: 'boundary', message: result.message });
      return;
    case 'error':
      json(res, 500, { error: result.message });
      return;
  }
};

export const postUnitUnlock: RouteHandler = async (_req, res, params) => {
  const name = params['name'] ?? '';
  const result = await unlockInner(name, { global: false, force: true });
  switch (result.kind) {
    case 'cleared':
      json(res, 200, { status: 'cleared', scope: result.scope });
      return;
    case 'no-lock':
      json(res, 200, { status: 'no-lock' });
      return;
    case 'alive-pid':
      json(res, 200, { status: 'cleared', note: `force-cleared from pid ${result.pid}` });
      const forceResult = await unlockInner(name, { global: false, force: true });
      if (forceResult.kind === 'cleared') {
        json(res, 200, { status: 'cleared', scope: forceResult.scope });
      }
      return;
    default:
      json(res, 200, { status: result.kind });
      return;
  }
};

export const postUnitClearSuppression: RouteHandler = async (req, res, params) => {
  const body = await readJson(req) as { key?: string };
  const key = body.key ?? params['name'] ?? '';
  const result = await clearSuppressionInner(key);
  json(res, result.kind === 'cleared' ? 200 : 404, result);
};

export const getSuppressions: RouteHandler = async (_req, res) => {
  const records = await suppressionsInner();
  json(res, 200, records);
};

export const getUnitRuns: RouteHandler = async (_req, res, params) => {
  const name = params['name'] ?? '';
  const stateDir = await findStateDir();
  const storage = new FsStorage(stateDir);
  const runs = await storage.listRuns(name);
  json(res, 200, runs);
};

export const getUnitCheck: RouteHandler = async (_req, res, params) => {
  const name = params['name'] ?? '';
  const result = await checkDecision(name);
  if (result.kind === 'boundary') {
    json(res, 502, { error: 'boundary', message: result.error });
    return;
  }
  json(res, 200, result.decision);
};
