import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RouteHandler } from '../router.js';
import { json, readJson } from '../router.js';
import { addInner } from '../../add.js';
import { findOrchestrationDir } from '../../orchestration.js';
import { discoverSources } from '../sources.js';

export const postAdd: RouteHandler = async (req, res) => {
  const body = await readJson(req) as { idea?: string; fileText?: string };
  const idea = body.idea?.trim();
  if (!idea) {
    json(res, 400, { error: 'idea is required' });
    return;
  }

  const result = await addInner(idea);

  if (body.fileText && result.kind === 'verdict' && result.verdict.scaffolded) {
    try {
      const orchDir = await findOrchestrationDir();
      const workPath = join(orchDir, result.verdict.name, 'work.md');
      let workMd = await readFile(workPath, 'utf8');
      workMd = workMd.replace(
        /# Context\n\n<!-- TODO\(token-smoulder\):.*?-->/s,
        `# Context\n\n${body.fileText}`,
      );
      await writeFile(workPath, workMd, 'utf8');
    } catch { /* best effort */ }
  }

  json(res, result.kind === 'verdict' ? 200 : 400, result);
};

export const getSources: RouteHandler = async (_req, res) => {
  const candidates = await discoverSources();
  json(res, 200, { sources: candidates });
};

export const postWidenAllowlist: RouteHandler = async (req, res, params) => {
  const name = params['name'] ?? '';
  const body = await readJson(req) as { riskClass?: string };
  const riskClass = body.riskClass;
  if (!riskClass) {
    json(res, 400, { error: 'riskClass is required' });
    return;
  }

  try {
    const orchDir = await findOrchestrationDir();
    const policyPath = join(orchDir, name, 'policy.ts');
    let src = await readFile(policyPath, 'utf8');

    const match = src.match(/safeRiskClass\(\s*\[([^\]]+)\]/);
    if (match?.[1]?.includes(riskClass)) {
      json(res, 200, { status: 'already-present' });
      return;
    }

    src = src.replace(
      /safeRiskClass\(\s*\[([^\]]+)\]/,
      (_, existing: string) => `safeRiskClass([${existing.trim()}, '${riskClass}']`,
    );
    await writeFile(policyPath, src, 'utf8');
    json(res, 200, { status: 'widened', riskClass });
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : 'unknown error' });
  }
};
