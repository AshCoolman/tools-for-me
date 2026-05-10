import { useEffect, useRef } from 'react';

type EventEntry = {
  name: string;
  timestamp: string;
  orchestrationName?: string;
  runId?: string;
  payload?: Record<string, unknown>;
};

type Props = {
  events: EventEntry[];
  filterUnit?: string;
};

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(); }
  catch { return iso; }
}

function eventColor(name: string): string {
  if (name.includes('completed')) return 'var(--ok)';
  if (name.includes('failed') || name.includes('blocked')) return 'var(--err)';
  if (name.includes('started')) return 'var(--blue)';
  return 'var(--fg)';
}

export function EventTail({ events, filterUnit }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const filtered = filterUnit
    ? events.filter(e => e.orchestrationName === filterUnit)
    : events;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filtered.length]);

  if (filtered.length === 0) {
    return <span className="dim">no events</span>;
  }

  const groups = new Map<string, EventEntry[]>();
  for (const ev of filtered) {
    const key = ev.runId ?? '__ungrouped__';
    const arr = groups.get(key);
    if (arr) arr.push(ev);
    else groups.set(key, [ev]);
  }

  return (
    <>
      {[...groups.entries()].map(([runId, evs]) => (
        <div key={runId}>
          {runId !== '__ungrouped__' && (
            <div className="event-group-header">
              run {runId.slice(0, 7)} · {formatTime(evs[0]!.timestamp)}
            </div>
          )}
          {evs.map((ev, i) => (
            <div key={i} className="event-row">
              <span className="event-time">{formatTime(ev.timestamp)}</span>
              <span className="event-name" style={{ color: eventColor(ev.name) }}>{ev.name}</span>
              <span>
                {ev.payload && Object.keys(ev.payload).length > 0 && JSON.stringify(ev.payload)}
              </span>
            </div>
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </>
  );
}
