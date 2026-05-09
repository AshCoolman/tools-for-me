import { spawn, type ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RouteHandler } from '../router.js';
import { json, readJson } from '../router.js';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const BIN = join(PKG_ROOT, 'bin', 'token-smoulder');

let daemonProc: ChildProcess | null = null;

export const getDaemonStatus: RouteHandler = async (_req, res) => {
  const running = daemonProc !== null && !daemonProc.killed && daemonProc.exitCode === null;
  json(res, 200, { running, pid: running ? daemonProc?.pid : null });
};

export const postDaemonStart: RouteHandler = async (req, res) => {
  if (daemonProc && !daemonProc.killed && daemonProc.exitCode === null) {
    json(res, 409, { error: 'daemon already running', pid: daemonProc.pid });
    return;
  }

  const body = await readJson(req) as { tick?: number };
  const args = ['daemon'];
  if (body.tick && Number.isFinite(body.tick) && body.tick > 0) {
    args.push('--tick', String(body.tick));
  }

  daemonProc = spawn(BIN, args, {
    stdio: 'ignore',
    detached: false,
    env: { ...process.env },
  });

  daemonProc.on('exit', () => { daemonProc = null; });
  daemonProc.on('error', () => { daemonProc = null; });

  json(res, 200, { status: 'started', pid: daemonProc.pid });
};

export const postDaemonStop: RouteHandler = async (_req, res) => {
  if (!daemonProc || daemonProc.killed || daemonProc.exitCode !== null) {
    json(res, 200, { status: 'not-running' });
    return;
  }

  const pid = daemonProc.pid;
  daemonProc.kill('SIGTERM');
  json(res, 200, { status: 'stopping', pid });
};
