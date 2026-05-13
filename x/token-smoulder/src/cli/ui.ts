import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from './ui-server/router.js';
import { readJson, json } from './ui-server/router.js';
import { SseHub } from './ui-server/sse.js';
import { getUnits, getUnitState, getUnitRuns, postUnitRun, postUnitKill, postUnitUnlock, postUnitClearSuppression, getSuppressions, getUnitCheck } from './ui-server/handlers/units.js';
import { getQuota, getExternal } from './ui-server/handlers/quota.js';
import { getClaudeUsage } from './ui-server/handlers/claude-usage.js';
import { getDaemonStatus, postDaemonStart, postDaemonStop } from './ui-server/handlers/daemon.js';
import { getPrefs, putPrefs } from './ui-server/handlers/prefs.js';
import { postAdd, getSources, postWidenAllowlist } from './ui-server/handlers/add.js';
import { getPlaybook, postPlaybook, putPlaybookRule, deletePlaybookRule } from './ui-server/handlers/playbook.js';
import { listInner } from './list.js';
import { eventsInner } from './events.js';
import { findOrchestrationDir } from './orchestration.js';
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
  router.on('GET', '/api/units/:name/runs', getUnitRuns);
  router.on('GET', '/api/units/:name/check', getUnitCheck);
  router.on('POST', '/api/units/:name/run', postUnitRun);
  router.on('POST', '/api/units/:name/kill', postUnitKill);
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
  router.on('GET', '/api/claude-usage', getClaudeUsage);
  router.on('GET', '/api/playbook', getPlaybook);
  router.on('POST', '/api/playbook', postPlaybook);
  router.on('PUT', '/api/playbook/:id', putPlaybookRule);
  router.on('DELETE', '/api/playbook/:id', deletePlaybookRule);

  router.on('GET', '/api/units/:name/work', async (_req, res, params) => {
    const name = params['name'] ?? '';
    try {
      const orchDir = await findOrchestrationDir();
      const workPath = join(orchDir, name, 'work.md');
      const text = await readFile(workPath, 'utf8');
      json(res, 200, { text });
    } catch {
      json(res, 404, { error: `work.md not found for ${name}` });
    }
  });

  router.on('PUT', '/api/units/:name/work', async (req, res, params) => {
    const name = params['name'] ?? '';
    const body = await readJson(req) as { text?: string };
    if (typeof body.text !== 'string') {
      json(res, 400, { error: 'text is required' });
      return;
    }
    try {
      const orchDir = await findOrchestrationDir();
      const workPath = join(orchDir, name, 'work.md');
      await stat(join(orchDir, name));
      await writeFile(workPath, body.text, 'utf8');
      sse.sendEvent('work-saved', JSON.stringify({ name }));
      json(res, 200, { status: 'saved' });
    } catch {
      json(res, 404, { error: `unit ${name} not found` });
    }
  });

  router.on('GET', '/api/units/:name/policy', async (_req, res, params) => {
    const name = params['name'] ?? '';
    try {
      const orchDir = await findOrchestrationDir();
      const text = await readFile(join(orchDir, name, 'policy.ts'), 'utf8');
      json(res, 200, { text });
    } catch {
      json(res, 404, { error: `policy.ts not found for ${name}` });
    }
  });

  router.on('PUT', '/api/units/:name/policy', async (req, res, params) => {
    const name = params['name'] ?? '';
    const body = await readJson(req) as { text?: string };
    if (typeof body.text !== 'string') {
      json(res, 400, { error: 'text is required' });
      return;
    }
    try {
      const orchDir = await findOrchestrationDir();
      await stat(join(orchDir, name));
      await writeFile(join(orchDir, name, 'policy.ts'), body.text, 'utf8');
      json(res, 200, { status: 'saved' });
    } catch {
      json(res, 404, { error: `unit ${name} not found` });
    }
  });

  router.on('GET', '/api/units/:name/executor', async (_req, res, params) => {
    const name = params['name'] ?? '';
    try {
      const orchDir = await findOrchestrationDir();
      const text = await readFile(join(orchDir, name, 'executor.ts'), 'utf8');
      json(res, 200, { text });
    } catch {
      json(res, 404, { error: `executor.ts not found for ${name}` });
    }
  });

  router.on('PUT', '/api/units/:name/executor', async (req, res, params) => {
    const name = params['name'] ?? '';
    const body = await readJson(req) as { text?: string };
    if (typeof body.text !== 'string') {
      json(res, 400, { error: 'text is required' });
      return;
    }
    try {
      const orchDir = await findOrchestrationDir();
      await stat(join(orchDir, name));
      await writeFile(join(orchDir, name, 'executor.ts'), body.text, 'utf8');
      json(res, 200, { status: 'saved' });
    } catch {
      json(res, 404, { error: `unit ${name} not found` });
    }
  });

  router.on('GET', '/api/events', async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const since = url.searchParams.get('since') ?? '1h';
    const type = url.searchParams.get('type') ?? undefined;
    const limit = Number(url.searchParams.get('limit') ?? '100');
    const result = await eventsInner({ since, type, limit: Number.isFinite(limit) ? limit : 100 });
    if (result.kind === 'unknown-type') {
      json(res, 400, { error: `unknown event type: ${result.type}` });
      return;
    }
    json(res, 200, result.events);
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

  let lastEventTs = new Date().toISOString();
  let sseTick = 0;
  const CLAUDE_USAGE_URL = process.env.TOKEN_SMOULDER_CLAUDE_USAGE_URL ?? 'http://127.0.0.1:8787/api/usage';

  const pollTimer = setInterval(async () => {
    sseTick++;
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
    if (sseTick % 30 === 1) {
      try {
        const resp = await fetch(CLAUDE_USAGE_URL, { signal: AbortSignal.timeout(2000) });
        if (resp.ok) {
          const data = await resp.json();
          sse.sendEvent('claude-usage', JSON.stringify(data));
        }
      } catch { /* ignore */ }
    }
    try {
      const result = await eventsInner({ since: '5s', limit: 50 });
      if (result.kind === 'ok') {
        const newEvents = result.events.filter(e => e.timestamp > lastEventTs);
        for (const ev of newEvents) {
          sse.sendEvent('event', JSON.stringify(ev));
        }
        if (newEvents.length > 0) {
          lastEventTs = newEvents[newEvents.length - 1]!.timestamp;
        }
      }
    } catch { /* ignore */ }
  }, Number(process.env['TOKEN_SMOULDER_SSE_POLL_MS']) || 1000);

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
