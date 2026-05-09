import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from './ui-server/router.js';
import { SseHub } from './ui-server/sse.js';
import { getUnits, getUnitState, postUnitRun, postUnitUnlock, postUnitClearSuppression, getSuppressions, getUnitCheck } from './ui-server/handlers/units.js';
import { getQuota, getExternal } from './ui-server/handlers/quota.js';
import { getDaemonStatus, postDaemonStart, postDaemonStop } from './ui-server/handlers/daemon.js';
import { getPrefs, putPrefs } from './ui-server/handlers/prefs.js';
import { postAdd, getSources, postWidenAllowlist } from './ui-server/handlers/add.js';
import { listInner } from './list.js';
import { selectQuotaSource, selectContentionDetector } from './wiring.js';

export type UiOptions = {
  port: number;
  host: string;
  banner: boolean;
};

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);
const DIST_DIR = join(fileURLToPath(import.meta.url), '..', 'ui-assets', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function rejectNonLoopback(host: string): void {
  if (LOOPBACK.has(host)) return;
  process.stderr.write(`ui: --host ${host} rejected — loopback only (127.0.0.1, ::1, localhost)\n`);
  process.exit(2);
}

async function serveStatic(res: ServerResponse, filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return false;
    const content = await readFile(filePath);
    const ct = MIME[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': ct, 'cache-control': 'no-cache' });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

export async function uiCommand(opts: UiOptions): Promise<number> {
  const host = opts.host;
  const port = opts.port;
  rejectNonLoopback(host);

  const router = new Router();
  const sse = new SseHub();

  router.on('GET', '/events', (req, res) => {
    sse.accept(req, res);
  });

  router.on('GET', '/api/units', getUnits);
  router.on('GET', '/api/units/:name/state', getUnitState);
  router.on('GET', '/api/units/:name/check', getUnitCheck);
  router.on('POST', '/api/units/:name/run', postUnitRun);
  router.on('POST', '/api/units/:name/unlock', postUnitUnlock);
  router.on('POST', '/api/units/:name/clear-suppression', postUnitClearSuppression);
  router.on('GET', '/api/suppressions', getSuppressions);
  router.on('GET', '/api/quota', getQuota);
  router.on('GET', '/api/external', getExternal);
  router.on('GET', '/api/daemon/status', getDaemonStatus);
  router.on('POST', '/api/daemon/start', postDaemonStart);
  router.on('POST', '/api/daemon/stop', postDaemonStop);
  router.on('GET', '/api/prefs', getPrefs);
  router.on('PUT', '/api/prefs', putPrefs);
  router.on('POST', '/api/add', postAdd);
  router.on('GET', '/api/sources', getSources);
  router.on('POST', '/api/units/:name/widen-allowlist', postWidenAllowlist);

  router.on('GET', '/assets/:path*', async (_req, res, params) => {
    const rel = params['path'] ?? '';
    const filePath = join(DIST_DIR, 'assets', rel);
    if (!filePath.startsWith(DIST_DIR)) {
      res.writeHead(403).end();
      return;
    }
    if (!(await serveStatic(res, filePath))) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });

  router.on('GET', '/', async (_req, res) => {
    if (!(await serveStatic(res, join(DIST_DIR, 'index.html')))) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('UI not built. Run: yarn build:ui');
    }
  });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await router.dispatch(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal server error' }));
      }
    }
  });

  sse.start();

  const pollTimer = setInterval(async () => {
    if (sse.size === 0) return;
    try {
      const units = await listInner();
      sse.sendEvent('units', JSON.stringify(units));
    } catch { /* ignore */ }
    try {
      const snap = await selectQuotaSource().read();
      sse.sendEvent('quota', JSON.stringify(snap));
    } catch { /* ignore */ }
    try {
      const detector = selectContentionDetector();
      const active = await detector.isActiveWithin(30 * 60_000);
      sse.sendEvent('external', JSON.stringify({ active }));
    } catch { /* ignore */ }
  }, 2000);

  return new Promise<number>(resolve => {
    let resolved = false;
    const shutdown = () => {
      if (resolved) return;
      resolved = true;
      clearInterval(pollTimer);
      sse.drain();
      server.close(() => resolve(0));
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      if (opts.banner) {
        process.stdout.write(`http://${host}:${actualPort}\n`);
      }
    });
  });
}
