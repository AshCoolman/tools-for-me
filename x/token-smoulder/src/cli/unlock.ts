import { confirm } from '@inquirer/prompts';
import { FsStorage } from '../adapters/storage/fs.js';
import { isPidAlive, releaseLock } from '../core/locks.js';
import type { LockScope } from '../adapters/storage/interface.js';
import { findStateDir } from './orchestration.js';

export type UnlockOptions = {
  global: boolean;
  force: boolean;
};

export type UnlockResult =
  | { kind: 'cleared'; scope: string }
  | { kind: 'no-lock' }
  | { kind: 'missing-name' }
  | { kind: 'alive-pid'; pid: number };

export async function unlockInner(
  name: string | undefined,
  opts: { global: boolean; force?: boolean },
): Promise<UnlockResult> {
  if (!opts.global && (name === undefined || name === '')) return { kind: 'missing-name' };
  const stateDir = await findStateDir();
  const storage = new FsStorage(stateDir);
  const scope: LockScope = opts.global
    ? { scope: 'global' }
    : { scope: 'orchestration', orchestrationName: name as string };

  const existing = await storage.inspectLock(scope);
  if (existing === null) return { kind: 'no-lock' };

  if (isPidAlive(existing.pid) && !opts.force) {
    return { kind: 'alive-pid', pid: existing.pid };
  }

  await releaseLock(storage, scope, existing);
  return { kind: 'cleared', scope: describeScope(scope) };
}

export async function unlockCommand(name: string | undefined, opts: UnlockOptions): Promise<number> {
  const result = await unlockInner(name, { global: opts.global });

  if (result.kind === 'missing-name') {
    process.stderr.write('unlock: provide <name> or --global\n');
    return 2;
  }
  if (result.kind === 'no-lock') {
    process.stderr.write('unlock: no lock present\n');
    return 0;
  }
  if (result.kind === 'alive-pid') {
    if (!opts.force) {
      process.stderr.write(
        `unlock: lock held by alive pid=${result.pid}; pass --force to override\n`,
      );
      return 4;
    }
    if (!process.stdin.isTTY) {
      process.stderr.write(
        `unlock: --force requires an interactive TTY for confirmation; lock held by pid=${result.pid}\n`,
      );
      return 4;
    }
    const ok = await confirm({
      message: `Force-clear lock held by alive pid=${result.pid}?`,
      default: false,
    });
    if (!ok) {
      process.stderr.write('unlock: aborted\n');
      return 1;
    }
    const forceResult = await unlockInner(name, { global: opts.global, force: true });
    if (forceResult.kind === 'cleared') {
      process.stdout.write(`unlock: cleared ${forceResult.scope}\n`);
      return 0;
    }
    process.stderr.write('unlock: no lock present\n');
    return 0;
  }

  process.stdout.write(`unlock: cleared ${result.scope}\n`);
  return 0;
}

function describeScope(scope: LockScope): string {
  if (scope.scope === 'orchestration') return `orchestration:${scope.orchestrationName}`;
  return scope.scope;
}
