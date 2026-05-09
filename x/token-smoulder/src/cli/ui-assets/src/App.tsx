import { useEffect, useState, useCallback } from 'react';
import { connectSse } from './lib/sse';
import { api } from './lib/api';
import { UnitBoard } from './components/UnitBoard';
import { QuotaGauge } from './components/QuotaGauge';
import { ExternalDot } from './components/ExternalDot';
import { DaemonControls } from './components/DaemonControls';

type UnitItem = { name: string; riskClass: string; latestStatus: string | null };
type QuotaSnap = { session: number; week: number };
type DaemonStatus = { running: boolean; pid: number | null };

export function App() {
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [quota, setQuota] = useState<QuotaSnap>({ session: 1, week: 1 });
  const [externalActive, setExternalActive] = useState(false);
  const [daemon, setDaemon] = useState<DaemonStatus>({ running: false, pid: null });

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

    const disconnect = connectSse('/events', ['units', 'quota', 'external'], (event, data) => {
      try {
        const parsed = JSON.parse(data);
        if (event === 'units') setUnits(parsed.items);
        if (event === 'quota') setQuota({ session: parsed.session, week: parsed.week });
        if (event === 'external') setExternalActive(parsed.active);
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
      <UnitBoard items={units} onRefresh={refreshUnits} />
    </div>
  );
}
