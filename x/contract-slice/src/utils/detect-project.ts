import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileExists } from './fs.js';

export async function detectPackageManager(
  dir: string,
): Promise<'pnpm' | 'yarn' | 'npm' | null> {
  if (await fileExists(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(join(dir, 'yarn.lock'))) return 'yarn';
  if (await fileExists(join(dir, 'package-lock.json'))) return 'npm';
  return null;
}

export async function hasScript(dir: string, name: string): Promise<boolean> {
  const pkgPath = join(dir, 'package.json');
  if (!(await fileExists(pkgPath))) return false;
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return Boolean(pkg.scripts?.[name]);
  } catch {
    return false;
  }
}
