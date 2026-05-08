import { FsStorage } from '../adapters/storage/fs.js';
import { findOrchestrationDir, findStateDir, scanOrchestrations } from './orchestration.js';

export type ListItem = { name: string; riskClass: string; latestStatus: string | null };

export async function listInner(): Promise<{ items: ListItem[] }> {
  const orchDir = await findOrchestrationDir();
  const stateDir = await findStateDir();
  const storage = new FsStorage(stateDir);
  const result = await scanOrchestrations(orchDir);
  const items: ListItem[] = [];
  for (const v of result.valid) {
    const latest = await storage.loadLatestRun(v.name).catch(() => null);
    items.push({ name: v.name, riskClass: v.riskClass, latestStatus: latest?.status ?? null });
  }
  return { items };
}

export async function listCommand(opts: { json: boolean }): Promise<number> {
  const { items } = await listInner();
  if (opts.json) {
    process.stdout.write(JSON.stringify({ items }));
  } else {
    for (const it of items) {
      process.stdout.write(`${it.name}\t${it.riskClass}\t${it.latestStatus ?? '-'}\n`);
    }
  }
  return 0;
}
