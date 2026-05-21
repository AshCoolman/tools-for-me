import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runDoctor } from '../src/commands/doctor.js';
import { runInit } from '../src/commands/init.js';

const mkdtempAsync = promisify(mkdtemp);

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = resolve(__dirname, '../src/templates');

const BASE_INIT_OPTS = {
  dryRun: false,
  force: false,
  claudeCommands: false,
  skill: false,
  scripts: false,
  docs: false,
  all: false,
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtempAsync(join(tmpdir(), 'cslice-doctor-'));
});

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await rm(tmpDir, { recursive: true, force: true });
});

describe('cslice doctor — US3: Check installation health', () => {
  it('reports PASS for all six command file checks after a full init', async () => {
    await runInit({ ...BASE_INIT_OPTS, target: tmpDir }, TEMPLATES_ROOT);

    const items = await runDoctor(tmpDir);
    const commandChecks = items.slice(0, 6);

    expect(commandChecks.every((i) => i.status === 'PASS')).toBe(true);
  });

  it('reports WARN for missing cslice-verify.sh', async () => {
    const items = await runDoctor(tmpDir);

    const scriptCheck = items.find((i) => i.label === 'scripts/cslice-verify.sh exists');
    expect(scriptCheck?.status).toBe('WARN');
  });

  it('reports FAIL for each missing command file', async () => {
    const items = await runDoctor(tmpDir);

    const commandChecks = items.slice(0, 6);
    expect(commandChecks.every((i) => i.status === 'FAIL')).toBe(true);
  });

  it('does not create or modify any files in the target directory', async () => {
    const before = readdirSync(tmpDir);
    await runDoctor(tmpDir);
    const after = readdirSync(tmpDir);
    expect(after).toEqual(before);
  });
});
