import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashContent, hashFile } from '../lib/hashing.js';
import { parseWork, type Work } from '../core/work-parser.js';
import type { Executor } from '../core/runner.js';
import type { Policy } from '../core/predicates/compose.js';
import { classifyRisk } from '../core/predicates/risk.js';
import type { RiskClass } from '../core/types.js';

export type LoadedOrchestration = {
  name: string;
  dir: string;
  workMd: string;
  workHash: string;
  policy: Policy;
  policyHash: string;
  executor: Executor;
  executorHash: string;
  riskClass: RiskClass;
  work: Work;
  plan: ReturnType<Executor>;
};

export async function findOrchestrationDir(): Promise<string> {
  const env = process.env.TOKEN_SMOULDER_ORCH_DIR;
  return resolve(env && env !== '' ? env : 'orchestration');
}

export async function findStateDir(): Promise<string> {
  const env = process.env.TOKEN_SMOULDER_STATE_DIR;
  return resolve(env && env !== '' ? env : '.orchestration-state');
}

export type ScanResult = {
  valid: Array<{ name: string; riskClass: RiskClass }>;
  invalid: Array<{ name: string; missing: string[]; errors: string[] }>;
};

export async function scanOrchestrations(orchDir: string): Promise<ScanResult> {
  const valid: ScanResult['valid'] = [];
  const invalid: ScanResult['invalid'] = [];
  let entries: string[];
  try {
    entries = await readdir(orchDir);
  } catch {
    return { valid, invalid };
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const dir = join(orchDir, name);
    const s = await stat(dir).catch(() => null);
    if (!s || !s.isDirectory()) continue;

    const required = ['policy.ts', 'work.md', 'executor.ts'];
    const missing: string[] = [];
    for (const f of required) {
      const exists = await stat(join(dir, f)).then(() => true).catch(() => false);
      if (!exists) missing.push(f);
    }
    if (missing.length > 0) {
      invalid.push({ name, missing, errors: [] });
      continue;
    }
    try {
      const loaded = await loadOrchestration(orchDir, name);
      valid.push({ name, riskClass: loaded.riskClass });
    } catch (e) {
      invalid.push({ name, missing: [], errors: [e instanceof Error ? e.message : String(e)] });
    }
  }
  return { valid, invalid };
}

export async function loadOrchestration(orchDir: string, name: string): Promise<LoadedOrchestration> {
  const dir = join(orchDir, name);
  const workMdPath = join(dir, 'work.md');
  const policyPath = join(dir, 'policy.ts');
  const executorPath = join(dir, 'executor.ts');

  const workMd = await readFile(workMdPath, 'utf8');
  const workHash = hashContent(workMd);
  const policyHash = await hashFile(policyPath);
  const executorHash = await hashFile(executorPath);

  const policyMod = (await import(pathToFileURL(policyPath).href)) as { policy?: Policy };
  if (!policyMod.policy) throw new Error(`policy.ts in ${name} did not export "policy"`);
  const executorMod = (await import(pathToFileURL(executorPath).href)) as { executor?: Executor };
  if (!executorMod.executor) throw new Error(`executor.ts in ${name} did not export "executor"`);

  const work = parseWork(workMd);
  const plan = executorMod.executor({ work });
  const riskClass = classifyRisk(plan.riskClass);

  return {
    name,
    dir,
    workMd,
    workHash,
    policy: policyMod.policy,
    policyHash,
    executor: executorMod.executor,
    executorHash,
    riskClass,
    work,
    plan,
  };
}
