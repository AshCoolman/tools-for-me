import type { IncomingMessage, ServerResponse } from 'node:http';

export function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (raw.length === 0) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => void | Promise<void>;

type Route = {
  method: string;
  segments: string[];
  handler: RouteHandler;
};

export class Router {
  private routes: Route[] = [];

  on(method: string, path: string, handler: RouteHandler): void {
    this.routes.push({
      method: method.toUpperCase(),
      segments: path.split('/').filter(Boolean),
      handler,
    });
  }

  async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const incoming = url.pathname.split('/').filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const params = matchSegments(route.segments, incoming);
      if (params !== null) {
        await route.handler(req, res, params);
        return;
      }
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  }
}

function matchSegments(
  pattern: string[],
  incoming: string[],
): Record<string, string> | null {
  if (pattern.length === 0 && incoming.length === 0) return {};

  const lastPattern = pattern[pattern.length - 1];
  const isWildcard = lastPattern?.endsWith('*');

  if (!isWildcard && pattern.length !== incoming.length) return null;
  if (isWildcard && incoming.length < pattern.length - 1) return null;

  const params: Record<string, string> = {};
  const limit = isWildcard ? pattern.length - 1 : pattern.length;

  for (let i = 0; i < limit; i++) {
    const seg = pattern[i]!;
    const val = incoming[i]!;
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(val);
    } else if (seg !== val) {
      return null;
    }
  }

  if (isWildcard) {
    const key = lastPattern!.replace('*', '').replace(':', '');
    params[key || '*'] = incoming.slice(limit).join('/');
  }

  return params;
}
