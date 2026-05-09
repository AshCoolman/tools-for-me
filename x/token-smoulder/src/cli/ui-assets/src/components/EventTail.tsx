import { useEffect, useRef, type CSSProperties } from 'react';

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

export function EventTail({ events, filterUnit }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const filtered = filterUnit
    ? events.filter(e => e.orchestrationName === filterUnit)
    : events;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filtered.length]);

  if (filtered.length === 0) {
    return <div style={{ color: '#666', fontSize: '0.75rem' }}>no events</div>;
  }

  return (
    <div style={container}>
      {filtered.map((ev, i) => (
        <div key={i} style={row}>
          <span style={ts}>{formatTs(ev.timestamp)}</span>
          <span style={eventName(ev.name)}>{ev.name}</span>
          {ev.orchestrationName && <span style={unit}>{ev.orchestrationName}</span>}
          {ev.payload && Object.keys(ev.payload).length > 0 && (
            <span style={payload}>{JSON.stringify(ev.payload)}</span>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function eventName(name: string): CSSProperties {
  const color =
    name.includes('completed') ? '#6d6' :
    name.includes('failed') || name.includes('blocked') ? '#d66' :
    name.includes('started') ? '#6bd' :
    '#dd6';
  return { color, fontSize: '0.75rem', fontWeight: 500 };
}

const container: CSSProperties = {
  maxHeight: 250,
  overflowY: 'auto',
  fontSize: '0.75rem',
  fontFamily: 'monospace',
};

const row: CSSProperties = {
  display: 'flex',
  gap: '0.6rem',
  padding: '0.15rem 0',
  borderBottom: '1px solid #2a2a2a',
};

const ts: CSSProperties = { color: '#666', minWidth: 70 };
const unit: CSSProperties = { color: '#888', fontSize: '0.7rem' };
const payload: CSSProperties = { color: '#555', fontSize: '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 };
