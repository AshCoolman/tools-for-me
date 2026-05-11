import './app.css';
import { useEffect, useState, useCallback, useRef } from 'react';
import { connectSse } from './lib/sse';
import { api } from './lib/api';
import { ExternalDot } from './components/ExternalDot';
import { Sidebar, statusColor, statusLabel } from './components/Sidebar';
import { AddTab } from './components/AddTab';
import { WorkEditor } from './components/WorkEditor';
import { RunsPanel } from './components/RunsPanel';

const ADD_TAB = '__add__';
const LS_SIDEBAR = 'ts:sidebar-width';
const LS_PANEL = 'ts:panel-height';

function readLS(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v ? Number(v) : fallback; }
  catch { return fallback; }
}

type UnitItem = { name: string; riskClass: string; latestStatus: string | null };
type QuotaSnap = { session: number; week: number };
type DaemonStatus = { running: boolean; pid: number | null };
type EventEntry = { name: string; timestamp: string; orchestrationName?: string; runId?: string; payload?: Record<string, unknown> };
type SuppressionRecord = { key: string; orchestrationName: string; reason: string };
function useResize(axis: 'x' | 'y', storageKey: string, fallback: number, min: number, max: number) {
  const [size, setSize] = useState(() => readLS(storageKey, fallback));
  const sizeRef = useRef(size);
  useEffect(() => { sizeRef.current = size; }, [size]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, String(size)); } catch {}
  }, [size, storageKey]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startPos = axis === 'x' ? e.clientX : e.clientY;
    const startSize = sizeRef.current;
    const handle = e.currentTarget as HTMLElement;
    handle.classList.add('active');

    const onMove = (ev: MouseEvent) => {
      const delta = axis === 'x'
        ? ev.clientX - startPos
        : startPos - ev.clientY;
      setSize(Math.min(max, Math.max(min, startSize + delta)));
    };
    const onUp = () => {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [axis, min, max]);

  return { size, onMouseDown };
}

export function App() {
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [quota, setQuota] = useState<QuotaSnap | null>(null);
  const [externalActive, setExternalActive] = useState(false);
  const [daemon, setDaemon] = useState<DaemonStatus>({ running: false, pid: null });
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [suppressions, setSuppressions] = useState<SuppressionRecord[]>([]);

  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const sidebar = useResize('x', LS_SIDEBAR, 210, 140, 400);
  const panel = useResize('y', LS_PANEL, 200, 80, 500);

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

  const refreshSuppressions = useCallback(async () => {
    try {
      const data = await api.get<SuppressionRecord[]>('/api/suppressions');
      setSuppressions(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshUnits();
    refreshDaemon();
    refreshSuppressions();

    api.get<EventEntry[]>('/api/events?since=1h&limit=200')
      .then(seed => setEvents(seed))
      .catch(() => {});

    const disconnect = connectSse('/events', ['units', 'quota', 'external', 'event'], (event, data) => {
      try {
        const parsed = JSON.parse(data);
        if (event === 'units') { setUnits(parsed.items); refreshSuppressions(); }
        if (event === 'quota') setQuota({ session: parsed.session, week: parsed.week });
        if (event === 'external') setExternalActive(parsed.active);
        if (event === 'event') setEvents(prev => {
          if (prev.some(e => e.timestamp === parsed.timestamp && e.name === parsed.name && e.orchestrationName === parsed.orchestrationName)) return prev;
          return [...prev.slice(-199), parsed];
        });
      } catch { /* ignore malformed */ }
    });

    return disconnect;
  }, [refreshUnits, refreshDaemon, refreshSuppressions]);

  const openTab = (name: string) => {
    setOpenTabs(prev => prev.includes(name) ? prev : [...prev, name]);
    setActiveTab(name);
  };

  const closeTab = (name: string) => {
    setOpenTabs(prev => {
      const next = prev.filter(t => t !== name);
      if (activeTab === name) {
        const idx = prev.indexOf(name);
        setActiveTab(next[Math.min(idx, next.length - 1)] ?? null);
      }
      return next;
    });
  };

  const convertAddTab = (newName: string) => {
    setOpenTabs(prev => prev.map(t => t === ADD_TAB ? newName : t));
    setActiveTab(newName);
  };

  const runUnit = async (name: string) => {
    setActionBusy('run');
    try {
      await api.post(`/api/units/${encodeURIComponent(name)}/run`);
    } catch { /* ignore */ }
    setActionBusy(null);
    refreshUnits();
  };

  const unlockUnit = async (name: string) => {
    setActionBusy('unlock');
    try {
      await api.post(`/api/units/${encodeURIComponent(name)}/unlock`);
    } catch { /* ignore */ }
    setActionBusy(null);
    refreshUnits();
  };

  const activeUnit = units.find(u => u.name === activeTab);
  const isAddTab = activeTab === ADD_TAB;

  return (
    <div className="frame">
      <div className="titlebar">
        <span>token-smoulder</span>
        <span className="spacer" />
        <ExternalDot active={externalActive} />
        <button
          className="btn primary"
          disabled={!activeUnit || actionBusy !== null}
          onClick={() => activeUnit && runUnit(activeUnit.name)}
        >
          {actionBusy === 'run' ? 'Running...' : 'Run'}
        </button>
        <button
          className="btn ghost"
          disabled={!activeUnit || actionBusy !== null}
          onClick={() => activeUnit && unlockUnit(activeUnit.name)}
        >
          Unlock
        </button>
      </div>

      <div className="body">
        <Sidebar
          units={units}
          suppressions={suppressions}
          activeTab={activeTab}
          onOpenTab={openTab}
          onOpenAddTab={() => openTab(ADD_TAB)}
          daemon={daemon}
          onRefreshDaemon={refreshDaemon}
          quota={quota}
          width={sidebar.size}
        />
        <div className="resize-h" onMouseDown={sidebar.onMouseDown} />

        <div className="main">
          <div className="tabbar">
            {openTabs.map(name => (
              <div
                key={name}
                className={`tab${activeTab === name ? ' active' : ''}`}
                onClick={() => setActiveTab(name)}
              >
                {name !== ADD_TAB && (
                  <span
                    className="dot"
                    style={{
                      background: statusColor(units.find(u => u.name === name)?.latestStatus ?? null),
                      width: 6, height: 6,
                    }}
                  />
                )}
                {name === ADD_TAB ? 'Add new work' : name}
                <span
                  className="close"
                  onClick={e => { e.stopPropagation(); closeTab(name); }}
                >
                  &times;
                </span>
              </div>
            ))}
            <span className="tab-add" title="Add new work" onClick={() => openTab(ADD_TAB)}>+</span>
          </div>

          <div className={`editor${isAddTab || !activeTab ? ' editor--single' : ''}`}>
            {activeTab === null && (
              <div className="placeholder">Select a work item from the sidebar</div>
            )}
            {isAddTab && (
              <div className="pane">
                <div className="pane-body">
                  <AddTab onConverted={convertAddTab} onRefreshUnits={refreshUnits} />
                </div>
              </div>
            )}
            {activeTab && !isAddTab && (
              <>
                <WorkEditor unitName={activeTab} file="work" />
                <WorkEditor unitName={activeTab} file="policy" />
                <WorkEditor unitName={activeTab} file="executor" />
              </>
            )}
          </div>

          <div className="resize-v" onMouseDown={panel.onMouseDown} />

          <div className="panel" style={{ height: panel.size }}>
            <RunsPanel
              units={units}
              events={events}
              focusedUnit={activeTab && !isAddTab ? activeTab : null}
            />
          </div>
        </div>
      </div>

      <div className="statusbar">
        {activeUnit && (
          <>
            <span
              className="dot"
              style={{
                background: statusColor(activeUnit.latestStatus),
                width: 6, height: 6,
              }}
            />
            <span>{activeUnit.name}</span>
            <span className="pill">
              {statusLabel(activeUnit.latestStatus).toUpperCase()}
            </span>
          </>
        )}
        {!activeUnit && !isAddTab && <span>no selection</span>}
        {isAddTab && <span>adding new work</span>}
        <span className="spacer" />
        {quota && (
          <span>
            week {Math.round(quota.week * 100)}% · session {Math.round(quota.session * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}
