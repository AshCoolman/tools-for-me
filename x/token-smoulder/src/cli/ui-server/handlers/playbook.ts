import type { RouteHandler } from '../router.js';
import { json, readJson } from '../router.js';
import { findStateDir } from '../../orchestration.js';
import { loadPlaybook, savePlaybook, appendRule, type PlaybookRule } from '../../../core/playbook.js';

export const getPlaybook: RouteHandler = async (_req, res) => {
  const stateDir = await findStateDir();
  const rules = await loadPlaybook(stateDir);
  json(res, 200, rules);
};

export const postPlaybook: RouteHandler = async (req, res) => {
  const body = await readJson(req) as Partial<PlaybookRule>;
  if (!body.match || !body.explanation || !body.remediation) {
    json(res, 400, { error: 'match, explanation, and remediation are required' });
    return;
  }
  const stateDir = await findStateDir();
  const rule = await appendRule(stateDir, {
    match: body.match,
    explanation: body.explanation,
    remediation: body.remediation,
    uiAction: body.uiAction,
    enabled: body.enabled ?? true,
    source: body.source ?? 'manual',
  });
  json(res, 201, rule);
};

export const putPlaybookRule: RouteHandler = async (req, res, params) => {
  const id = params['id'] ?? '';
  const body = await readJson(req) as Partial<PlaybookRule>;
  const stateDir = await findStateDir();
  const rules = await loadPlaybook(stateDir);
  const idx = rules.findIndex(r => r.id === id);
  if (idx === -1) {
    json(res, 404, { error: `rule ${id} not found` });
    return;
  }
  const rule = rules[idx]!;
  if (body.match !== undefined) rule.match = body.match;
  if (body.explanation !== undefined) rule.explanation = body.explanation;
  if (body.remediation !== undefined) rule.remediation = body.remediation;
  if (body.uiAction !== undefined) rule.uiAction = body.uiAction;
  if (body.enabled !== undefined) rule.enabled = body.enabled;
  await savePlaybook(stateDir, rules);
  json(res, 200, rule);
};

export const deletePlaybookRule: RouteHandler = async (_req, res, params) => {
  const id = params['id'] ?? '';
  const stateDir = await findStateDir();
  const rules = await loadPlaybook(stateDir);
  const idx = rules.findIndex(r => r.id === id);
  if (idx === -1) {
    json(res, 404, { error: `rule ${id} not found` });
    return;
  }
  rules.splice(idx, 1);
  await savePlaybook(stateDir, rules);
  json(res, 200, { status: 'deleted' });
};
