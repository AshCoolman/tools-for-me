import { useEffect, useState, useCallback } from 'react';
import { connectSse } from './lib/sse';
import { api } from './lib/api';
import { UnitBoard } from './components/UnitBoard';
import { QuotaGauge } from './components/QuotaGauge';
import { ExternalDot } from './components/ExternalDot';
import { DaemonControls } from './components/DaemonControls';
import { AddDropZone } from './components/AddDropZone';
import { SourceShelf } from './components/SourceShelf';
import { Verdict, type AddVerdict } from './components/Verdict';
import { EventTail } from './components/EventTail';
import { WorkEditor } from './components/WorkEditor';
import { SuppressionsPanel } from './components/SuppressionsPanel';
import { RunSummary } from './components/RunSummary';

type UnitItem = { name: string; riskClass: string; latestStatus: string | null };
type QuotaSnap = { session: number; week: number };
type DaemonStatus = { running: boolean; pid: number | null };
type EventEntry = { name: string; timestamp: string; orchestrationName?: string; runId?: string; payload?: Record<string, unknown> };

export function App() {
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [quota, setQuota] = useState<QuotaSnap>({ session: 1, week: 1 });
  const [externalActive, setExternalActive] = useState(false);
  const [daemon, setDaemon] = useState<DaemonStatus>({ running: false, pid: null });
  const [verdict, setVerdict] = useState<AddVerdict | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [events, setEvents] = useState<EventEntry[]>([]);

  const refreshUnits = useCallback(async () => {
    try {
      const data = await api.get<{ items: UnitItem[] }>('/api/units');
      setUnits(data.items);
    } catch { /* ignore */ }
  }, []);

  const refreshDaemon = useCallback(async () => {
    try {
      const data = await api.get<DaemonStatus>('/api/daemon/status');
      setDaemon(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshUnits();
    refreshDaemon();

    api.get<EventEntry[]>('/api/events?since=1h&limit=200')
      .then(seed => setEvents(seed))
      .catch(() => {});

    const disconnect = connectSse('/events', ['units', 'quota', 'external', 'event'], (event, data) => {
      try {
        const parsed = JSON.parse(data);
        if (event === 'units') setUnits(parsed.items);
        if (event === 'quota') setQuota({ session: parsed.session, week: parsed.week });
        if (event === 'external') setExternalActive(parsed.active);
        if (event === 'event') setEvents(prev => {
          if (prev.some(e => e.timestamp === parsed.timestamp && e.name === parsed.name && e.orchestrationName === parsed.orchestrationName)) return prev;
          return [...prev.slice(-199), parsed];
        });
      } catch { /* ignore malformed */ }
    });

    return disconnect;
  }, [refreshUnits, refreshDaemon]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', background: '#1a1a1a', color: '#ddd', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.2rem' }}>token-smoulder</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <QuotaGauge label="week" value={quota.week} />
          <QuotaGauge label="session" value={quota.session} />
          <ExternalDot active={externalActive} />
          <DaemonControls running={daemon.running} onRefresh={refreshDaemon} />
        </div>
      </div>
      <UnitBoard items={units} onRefresh={refreshUnits} selectedUnit={selectedUnit} onSelect={setSelectedUnit} />
      {selectedUnit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>last run</h2>
            <RunSummary unitName={selectedUnit} />
          </div>
          <div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>work.md</h2>
            <WorkEditor unitName={selectedUnit} />
          </div>
          <div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>events</h2>
            <EventTail events={events} filterUnit={selectedUnit} />
          </div>
        </div>
      )}
      <SuppressionsPanel />

      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 500 }}>add unit</h2>
        <AddDropZone onVerdict={(v) => { setVerdict(v); refreshUnits(); }} />
        <SourceShelf onSelect={(s) => {
          api.post<{ kind: string; verdict?: AddVerdict }>('/api/add', { idea: s.title, fileText: s.snippet })
            .then(r => { if (r.kind === 'verdict' && r.verdict) { setVerdict(r.verdict); refreshUnits(); } })
            .catch(() => {});
        }} />
        {verdict && (
          <Verdict
            verdict={verdict}
            onDismiss={() => setVerdict(null)}
            onRefresh={() => {
              api.post<{ kind: string; verdict?: AddVerdict }>('/api/add', { idea: verdict.name })
                .then(r => { if (r.kind === 'verdict' && r.verdict) setVerdict(r.verdict); })
                .catch(() => {});
              refreshUnits();
            }}
          />
        )}
      </div>
    </div>
  );
}
