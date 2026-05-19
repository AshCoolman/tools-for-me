import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import type { RouteHandler } from '../router.js';
import { json } from '../router.js';
import { findOrchestrationDir } from '../../orchestration.js';

const FILE_MAP: Record<string, string> = {
  work: 'work.md',
  policy: 'policy.ts',
  executor: 'executor.ts',
  'work.md': 'work.md',
  'policy.ts': 'policy.ts',
  'executor.ts': 'executor.ts',
};

async function resolveFilePath(name: string, file: string): Promise<string | null> {
  const basename = FILE_MAP[file];
  if (!basename) return null;
  const orchDir = await findOrchestrationDir();
  const filePath = join(orchDir, name, basename);
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return null;
    return filePath;
  } catch {
    return null;
  }
}

function spawnDetached(args: string[]): void {
  const child = spawn('open', args, { stdio: 'ignore', detached: true });
  child.unref();
}

export const postFileReveal: RouteHandler = async (_req, res, params) => {
  if (process.platform !== 'darwin') {
    json(res, 501, { error: 'reveal not supported on this platform', platform: process.platform });
    return;
  }
  const name = params['name'] ?? '';
  const file = params['file'] ?? '';
  const filePath = await resolveFilePath(name, file);
  if (filePath === null) {
    json(res, 404, { error: `file not found for ${name}/${file}` });
    return;
  }
  spawnDetached(['-R', filePath]);
  json(res, 200, { status: 'revealed', path: filePath });
};

export const postFileOpen: RouteHandler = async (_req, res, params) => {
  if (process.platform !== 'darwin') {
    json(res, 501, { error: 'open not supported on this platform', platform: process.platform });
    return;
  }
  const name = params['name'] ?? '';
  const file = params['file'] ?? '';
  const filePath = await resolveFilePath(name, file);
  if (filePath === null) {
    json(res, 404, { error: `file not found for ${name}/${file}` });
    return;
  }
  spawnDetached([filePath]);
  json(res, 200, { status: 'opened', path: filePath });
};
