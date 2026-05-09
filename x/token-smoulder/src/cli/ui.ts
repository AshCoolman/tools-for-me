import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Router } from './ui-server/router.js';
import { SseHub } from './ui-server/sse.js';

export type UiOptions = {
  port: number;
  host: string;
  banner: boolean;
};

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

function rejectNonLoopback(host: string): void {
  if (LOOPBACK.has(host)) return;
  process.stderr.write(`ui: --host ${host} rejected — loopback only (127.0.0.1, ::1, localhost)\n`);
  process.exit(2);
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
