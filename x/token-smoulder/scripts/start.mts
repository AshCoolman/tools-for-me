#!/usr/bin/env -S npx tsx

import { Command } from 'commander';
import { select, Separator } from '@inquirer/prompts';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(PKG_ROOT, 'bin', 'token-smoulder');

function fail(msg: string): never {
  process.stderr.write(`FAIL: ${msg}\n`);
  process.exit(1);
}

type Entry = { label: string; desc: string; cmd: string[] };

function isDaemonRunning(): boolean {
  const stateDir = process.env.TOKEN_SMOULDER_STATE_DIR
    || join(process.cwd(), '.orchestration-state');
  const lockPath = join(stateDir, 'locks', 'global.lock');
  if (!existsSync(lockPath)) return false;
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    process.kill(lock.pid, 0);
    return true;
  } catch {
    return false;
  }
}

const SERVICES: Entry[] = [
  { label: 'daemon', desc: 'Background dispatcher (30s tick)', cmd: [BIN, 'daemon'] },
];

const TASKS: Entry[] = [
  { label: 'typecheck', desc: 'Type-check src/',       cmd: ['yarn', 'typecheck'] },
  { label: 'test',      desc: 'Run vitest',            cmd: ['yarn', 'test'] },
  { label: 'lint',      desc: 'ESLint src/ tests/',    cmd: ['yarn', 'lint'] },
  { label: 'list',      desc: 'Show all work units',   cmd: [BIN, 'list'] },
  { label: 'events',    desc: 'Recent events (1h)',    cmd: [BIN, 'events', '--since', '1h'] },
];

async function main(): Promise<void> {
  if (!process.stdin.isTTY) fail('TTY required — scripts/start is interactive');

  if (!existsSync(join(PKG_ROOT, 'node_modules'))) {
    fail('node_modules missing — run: yarn install');
  }

  const daemonUp = isDaemonRunning();

  const picked = await select<Entry>({
    message: 'token-smoulder',
    choices: [
      new Separator('─── Services ───'),
      ...SERVICES.map(s => ({
        name: `${s.label === 'daemon' && daemonUp ? '●' : '○'} ${s.label}`,
        value: s,
        description: s.desc,
      })),
      new Separator('─── Tasks ───'),
      ...TASKS.map(t => ({
        name: `  ${t.label}`,
        value: t,
        description: t.desc,
      })),
    ],
  });

  const result = spawnSync(picked.cmd[0], picked.cmd.slice(1), {
    stdio: 'inherit',
    cwd: PKG_ROOT,
  });

  process.exit(result.status ?? 1);
}

new Command()
  .name('start')
  .description('Dev entry point for token-smoulder')
  .action(main)
  .parse();
