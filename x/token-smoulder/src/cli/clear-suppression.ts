import { FsStorage } from '../adapters/storage/fs.js';
import { findStateDir } from './orchestration.js';

export type ClearSuppressionResult =
  | { kind: 'cleared'; key: string }
  | { kind: 'not-found'; key: string };

export async function clearSuppressionInner(key: string): Promise<ClearSuppressionResult> {
  const stateDir = await findStateDir();
  const storage = new FsStorage(stateDir);
  const existing = await storage.loadSuppression(key);
  if (existing === null) return { kind: 'not-found', key };
  await storage.clearSuppression(key);
  return { kind: 'cleared', key };
}

export async function clearSuppressionCommand(key: string): Promise<number> {
  const result = await clearSuppressionInner(key);
  if (result.kind === 'not-found') {
    process.stderr.write(`clear-suppression: no record for key ${result.key}\n`);
    return 2;
  }
  process.stdout.write(`cleared ${result.key}\n`);
  return 0;
}
