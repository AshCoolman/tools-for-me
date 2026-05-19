#!/usr/bin/env -S npx tsx

import { Command } from 'commander';
import { select, checkbox } from '@inquirer/prompts';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(PKG_ROOT, 'bin', 'token-smoulder');
const HARVEST = join(PKG_ROOT, 'scripts', 'harvest-ideas');
const IDEAS_DIR = process.env.HARVEST_IDEAS_DIR || join(homedir(), 'ac', 'ideas');

function fail(msg: string): never {
  process.stderr.write(`FAIL: ${msg}\n`);
  process.exit(1);
}

type Entry = { label: string; desc: string; cmd: string[]; after?: string };

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

const SERVICES: Entry[] = [
  { label: 'daemon',       desc: 'Background dispatcher (30s tick)',    cmd: [BIN, 'daemon'] },
  { label: 'ui',           desc: 'Web UI at 127.0.0.1:8788',           cmd: [BIN, 'ui'] },
  { label: 'daemon:watch', desc: 'Daemon with file-watch restart',     cmd: [BIN, '--watch', 'daemon'] },
  { label: 'serve:watch',  desc: 'Web UI with file-watch restart',     cmd: [BIN, '--watch', 'ui'] },
];

const TASKS: Entry[] = [
  { label: 'typecheck', desc: 'Type-check src/',       cmd: ['yarn', 'typecheck'] },
  { label: 'test',      desc: 'Run vitest',            cmd: ['yarn', 'test'] },
  { label: 'test:e2e',  desc: 'Playwright e2e suite',  cmd: ['yarn', 'playwright', 'test'],
    after: 'View report: yarn playwright show-report' },
  { label: 'lint',      desc: 'ESLint src/ tests/',    cmd: ['yarn', 'lint'] },
  { label: 'build:ui',  desc: 'Build UI assets',       cmd: ['yarn', 'build:ui'] },
  { label: 'ui:dev',    desc: 'Vite dev server',       cmd: ['yarn', 'ui:dev'] },
  { label: 'list',      desc: 'Show all work units',   cmd: [BIN, 'list'] },
  { label: 'events',    desc: 'Recent events (1h)',    cmd: [BIN, 'events', '--since', '1h'] },
  { label: 'harvest',       desc: `Scan ${IDEAS_DIR} & show board`, cmd: [HARVEST, IDEAS_DIR] },
  { label: 'harvest:board', desc: 'Show harvest board',             cmd: [HARVEST, 'board'] },
  { label: 'harvest:pick',  desc: 'Pick an idea to specify',        cmd: [HARVEST, 'pick'] },
];

async function servicesMenu(): Promise<void> {
  const daemonUp = isDaemonRunning();
  const uiUp = isUiRunning();

  const serviceStatus = (label: string): string => {
    if (label === 'daemon') return daemonUp ? '●' : '○';
    if (label === 'ui') return uiUp ? '●' : '○';
    return '○';
  };

  const selected = await checkbox<Entry>({
    message: 'services',
    choices: SERVICES.map(s => ({
      name: `${serviceStatus(s.label)} ${s.label}`,
      value: s,
      description: s.desc,
    })),
  });

  if (selected.length === 0) return;

  if (selected.length === 1) {
    const s = selected[0];
    const result = spawnSync(s.cmd[0], s.cmd.slice(1), { stdio: 'inherit', cwd: PKG_ROOT });
    process.exit(result.status ?? 1);
  }

  const hasMprocs = spawnSync('mprocs', ['--version'], { stdio: 'ignore' }).status === 0;
  if (!hasMprocs) fail('mprocs not found — install: brew install mprocs');

  const names = selected.map(s => s.label).join(',');
  const cmds = selected.map(s => s.cmd.join(' '));
  const result = spawnSync('mprocs', ['--names', names, ...cmds], { stdio: 'inherit', cwd: PKG_ROOT });
  process.exit(result.status ?? 1);
}

async function tasksMenu(): Promise<void> {
  const task = await select<Entry>({
    message: 'tasks',
    choices: TASKS.map(t => ({
      name: t.label,
      value: t,
      description: t.desc,
    })),
  });

  const result = spawnSync(task.cmd[0], task.cmd.slice(1), { stdio: 'inherit', cwd: PKG_ROOT });
  if (task.after) process.stdout.write(`\n${task.after}\n`);
  process.exit(result.status ?? 1);
}

const ALL_ENTRIES = [...SERVICES, ...TASKS];

function runEntry(entry: Entry): never {
  const result = spawnSync(entry.cmd[0], entry.cmd.slice(1), { stdio: 'inherit', cwd: PKG_ROOT });
  if (entry.after) process.stdout.write(`\n${entry.after}\n`);
  process.exit(result.status ?? 1);
}

async function main(label?: string): Promise<void> {
  if (!existsSync(join(PKG_ROOT, 'node_modules'))) {
    fail('node_modules missing — run: yarn install');
  }

  if (label) {
    const entry = ALL_ENTRIES.find(e => e.label === label);
    if (!entry) {
      const valid = ALL_ENTRIES.map(e => e.label).join(', ');
      fail(`unknown label '${label}' — valid: ${valid}`);
    }
    runEntry(entry);
  }

  if (!process.stdin.isTTY) fail('TTY required — scripts/start is interactive');

  const menu = await select<'services' | 'tasks'>({
    message: 'token-smoulder',
    choices: [
      { name: 'Services', value: 'services' },
      { name: 'Tasks',    value: 'tasks' },
    ],
  });

  if (menu === 'services') await servicesMenu();
  if (menu === 'tasks') await tasksMenu();
}

new Command()
  .name('start')
  .description('Dev entry point for token-smoulder')
  .argument('[label]', `run directly: ${ALL_ENTRIES.map(e => e.label).join(', ')}`)
  .action(main)
  .parse();
