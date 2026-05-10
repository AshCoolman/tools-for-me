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
type DevEntry = { label: 'dev'; desc: string; procs: Record<string, { cmd: string[] }> };
type Choice = Entry | DevEntry;

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

function isUiRunning(): boolean {
  try {
    const res = spawnSync('curl', ['-sf', '-o', '/dev/null', 'http://127.0.0.1:8788/api/units'], { timeout: 1000 });
    return res.status === 0;
  } catch {
    return false;
  }
}

const DEV: DevEntry = {
  label: 'dev',
  desc: 'daemon + ui (mprocs)',
  procs: {
    daemon: { cmd: [BIN, 'daemon'] },
    ui:     { cmd: [BIN, 'ui'] },
  },
};

const SERVICES: Entry[] = [
  { label: 'daemon', desc: 'Background dispatcher (30s tick)', cmd: [BIN, 'daemon'] },
  { label: 'ui',     desc: 'Web UI at 127.0.0.1:8788',        cmd: [BIN, 'ui'] },
];

const TASKS: Entry[] = [
  { label: 'typecheck', desc: 'Type-check src/',       cmd: ['yarn', 'typecheck'] },
  { label: 'test',      desc: 'Run vitest',            cmd: ['yarn', 'test'] },
  { label: 'lint',      desc: 'ESLint src/ tests/',    cmd: ['yarn', 'lint'] },
  { label: 'build:ui',  desc: 'Build UI assets',       cmd: ['yarn', 'build:ui'] },
  { label: 'ui:dev',    desc: 'Vite dev server',       cmd: ['yarn', 'ui:dev'] },
  { label: 'list',      desc: 'Show all work units',   cmd: [BIN, 'list'] },
  { label: 'events',    desc: 'Recent events (1h)',    cmd: [BIN, 'events', '--since', '1h'] },
];

function isDevEntry(c: Choice): c is DevEntry {
  return 'procs' in c;
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY) fail('TTY required — scripts/start is interactive');

  if (!existsSync(join(PKG_ROOT, 'node_modules'))) {
    fail('node_modules missing — run: yarn install');
  }

  const daemonUp = isDaemonRunning();
  const uiUp = isUiRunning();

  const serviceStatus = (s: Entry): string => {
    if (s.label === 'daemon') return daemonUp ? '●' : '○';
    if (s.label === 'ui') return uiUp ? '●' : '○';
    return '○';
  };

  const picked = await select<Choice>({
    message: 'token-smoulder',
    choices: [
      new Separator('─── Services ───'),
      { name: 'dev', value: DEV, description: DEV.desc },
      ...SERVICES.map(s => ({
        name: `${serviceStatus(s)} ${s.label}`,
        value: s,
        description: s.desc,
      })),
      new Separator('─── Tasks ───'),
      ...TASKS.map(t => ({
        name: t.label,
        value: t,
        description: t.desc,
      })),
    ],
  });

  if (isDevEntry(picked)) {
    const hasMprocs = spawnSync('mprocs', ['--version'], { stdio: 'ignore' }).status === 0;
    if (!hasMprocs) fail('mprocs not found — install: brew install mprocs');

    const entries = Object.entries(picked.procs);
    const names = entries.map(([k]) => k).join(',');
    const cmds = entries.map(([, v]) => v.cmd.join(' '));
    const result = spawnSync('mprocs', ['--names', names, ...cmds], {
      stdio: 'inherit',
      cwd: PKG_ROOT,
    });
    process.exit(result.status ?? 1);
  }

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
