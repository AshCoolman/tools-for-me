import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runInit } from '../src/commands/init.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = resolve(__dirname, '../src/templates');

const BASE_OPTS = {
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
  tmpDir = await mkdtemp(join(tmpdir(), 'cslice-init-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('cslice init — US1: Install Claude workflow commands', () => {
  it('creates all six command files in a fresh directory', async () => {
    const results = await runInit({ ...BASE_OPTS, target: tmpDir }, TEMPLATES_ROOT);

    const commandResults = results.filter((r) => r.path.startsWith('.claude/commands/'));
    expect(commandResults).toHaveLength(6);
    expect(commandResults.every((r) => r.action === 'CREATE')).toBe(true);

    const files = await readdir(join(tmpDir, '.claude', 'commands'));
    expect(files.sort()).toEqual([
      'cslice.contract.md',
      'cslice.implement.md',
      'cslice.intent.md',
      'cslice.review.md',
      'cslice.tests.md',
      'cslice.verify.md',
    ]);
  });

  it('skips existing files without --force and leaves content unchanged', async () => {
    await runInit({ ...BASE_OPTS, target: tmpDir }, TEMPLATES_ROOT);

    const intentPath = join(tmpDir, '.claude', 'commands', 'cslice.intent.md');
    const original = await readFile(intentPath, 'utf8');

    const results = await runInit({ ...BASE_OPTS, target: tmpDir }, TEMPLATES_ROOT);

    const commandResults = results.filter((r) => r.path.startsWith('.claude/commands/'));
    expect(commandResults.every((r) => r.action === 'SKIP')).toBe(true);

    const after = await readFile(intentPath, 'utf8');
    expect(after).toBe(original);
  });

  it('overwrites existing files with --force', async () => {
    await runInit({ ...BASE_OPTS, target: tmpDir }, TEMPLATES_ROOT);

    const results = await runInit({ ...BASE_OPTS, force: true, target: tmpDir }, TEMPLATES_ROOT);

    const commandResults = results.filter((r) => r.path.startsWith('.claude/commands/'));
    expect(commandResults.every((r) => r.action === 'OVERWRITE')).toBe(true);
  });

  it('reports actions but writes zero files with --dry-run', async () => {
    const results = await runInit({ ...BASE_OPTS, dryRun: true, target: tmpDir }, TEMPLATES_ROOT);

    expect(results.some((r) => r.action === 'CREATE')).toBe(true);

    try {
      await readdir(join(tmpDir, '.claude'));
      expect.fail('.claude directory should not exist after dry-run');
    } catch {
      // expected — directory was not created
    }
  });
});

describe('cslice init --skill — US2: Add optional skill reference files', () => {
  it('creates SKILL.md and six reference files with --skill', async () => {
    const results = await runInit(
      { ...BASE_OPTS, skill: true, target: tmpDir },
      TEMPLATES_ROOT,
    );

    const skillResults = results.filter((r) => r.path.startsWith('.claude/skills/'));
    expect(skillResults).toHaveLength(7);

    const topLevel = await readdir(join(tmpDir, '.claude', 'skills', 'contract-slice'));
    expect(topLevel).toContain('SKILL.md');

    const refs = await readdir(
      join(tmpDir, '.claude', 'skills', 'contract-slice', 'references'),
    );
    expect(refs).toHaveLength(6);
  });

  it('does not create skill files without --skill', async () => {
    await runInit({ ...BASE_OPTS, target: tmpDir }, TEMPLATES_ROOT);

    try {
      await readdir(join(tmpDir, '.claude', 'skills'));
      expect.fail('skills directory should not exist');
    } catch {
      // expected
    }
  });
});
