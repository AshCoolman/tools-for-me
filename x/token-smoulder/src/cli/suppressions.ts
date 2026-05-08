import { FsStorage } from '../adapters/storage/fs.js';
import { findStateDir } from './orchestration.js';

export async function suppressionsInner() {
  const stateDir = await findStateDir();
  const storage = new FsStorage(stateDir);
  return storage.listActiveSuppressions();
}

export async function suppressionsCommand(): Promise<number> {
  const records = await suppressionsInner();
  process.stdout.write(JSON.stringify(records) + '\n');
  return 0;
}
