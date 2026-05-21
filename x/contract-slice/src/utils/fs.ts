import { mkdir, access, chmod, constants } from 'node:fs/promises';

export async function mkdirp(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function chmodX(path: string): Promise<void> {
  await chmod(path, 0o755);
}
