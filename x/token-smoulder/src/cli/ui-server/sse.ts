import type { IncomingMessage, ServerResponse } from 'node:http';

export type SseClient = {
  res: ServerResponse;
  id: number;
};

let nextId = 1;

export class SseHub {
  private clients = new Map<number, SseClient>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  start(intervalMs = 15_000): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.broadcast(':\n\n');
    }, intervalMs);
  }

  accept(req: IncomingMessage, res: ServerResponse): SseClient {
    const id = nextId++;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(':\n\n');

    const client: SseClient = { res, id };
    this.clients.set(id, client);

    const remove = () => this.clients.delete(id);
    req.on('close', remove);
    res.on('close', remove);

    return client;
  }

  send(client: SseClient, event: string, data: string): void {
    if (client.res.destroyed) {
      this.clients.delete(client.id);
      return;
    }
    client.res.write(`event: ${event}\ndata: ${data}\n\n`);
  }

  broadcast(raw: string): void {
    for (const [id, client] of this.clients) {
      if (client.res.destroyed) {
        this.clients.delete(id);
        continue;
      }
      client.res.write(raw);
    }
  }

  sendEvent(event: string, data: string): void {
    this.broadcast(`event: ${event}\ndata: ${data}\n\n`);
  }

  get size(): number {
    return this.clients.size;
  }

  drain(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const [, client] of this.clients) {
      if (!client.res.destroyed) client.res.end();
    }
    this.clients.clear();
  }
}
