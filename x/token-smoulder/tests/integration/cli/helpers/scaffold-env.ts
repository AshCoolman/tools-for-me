import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export type ScaffoldEnv = {
  rootDir: string;
  orchDir: string;
  stateDir: string;
  env: NodeJS.ProcessEnv;
};

export async function makeScaffoldEnv(): Promise<ScaffoldEnv> {
  const rootDir = await mkdtemp(join(tmpdir(), 'tsm-'));
  const orchDir = join(rootDir, 'orchestration');
  const stateDir = join(rootDir, '.orchestration-state');
  await mkdir(orchDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });

  const projectSrc = resolve(process.cwd(), 'src');
  await symlink(projectSrc, join(rootDir, 'src'), 'dir');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TOKEN_SMOULDER_ORCH_DIR: orchDir,
    TOKEN_SMOULDER_STATE_DIR: stateDir,
    TOKEN_SMOULDER_QUOTA_SOURCE: 'fake-pass',
  };
  return { rootDir, orchDir, stateDir, env };
}
