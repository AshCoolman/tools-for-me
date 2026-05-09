export type SseHandler = (event: string, data: string) => void;

export function connectSse(
  url: string,
  eventNames: string[],
  handler: SseHandler,
  reconnectMs = 3000,
): () => void {
  let es: EventSource | null = null;
  let stopped = false;

  function connect() {
    if (stopped) return;
    es = new EventSource(url);

    for (const name of eventNames) {
      es.addEventListener(name, (e) => {
        handler(name, (e as MessageEvent).data);
      });
    }

    es.onerror = () => {
      es?.close();
      if (!stopped) setTimeout(connect, reconnectMs);
    };
  }

  connect();
  return () => {
    stopped = true;
    es?.close();
  };
}
