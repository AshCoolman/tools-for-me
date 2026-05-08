import { FsStorage } from '../adapters/storage/fs.js';
import { findStateDir } from './orchestration.js';

export async function stateInner(name: string) {
  const stateDir = await findStateDir();
  const storage = new FsStorage(stateDir);
  return storage.loadLatestRun(name);
}

export async function stateCommand(name: string): Promise<number> {
  const record = await stateInner(name);
  if (record === null) {
    process.stderr.write(`state: no run record for ${name}\n`);
    return 2;
  }
  process.stdout.write(JSON.stringify(record) + '\n');
  return 0;
}
