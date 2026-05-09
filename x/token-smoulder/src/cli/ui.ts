import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from './ui-server/router.js';
import { SseHub } from './ui-server/sse.js';

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

  return new Promise<number>(resolve => {
    let resolved = false;
    const shutdown = () => {
      if (resolved) return;
      resolved = true;
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
