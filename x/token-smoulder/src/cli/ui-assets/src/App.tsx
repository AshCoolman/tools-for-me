import './app.css';
import { useEffect, useState, useCallback } from 'react';
import { connectSse } from './lib/sse';
import { api } from './lib/api';
import { ExternalDot } from './components/ExternalDot';
import { Sidebar, statusColor, statusLabel } from './components/Sidebar';
import { AddDropZone } from './components/AddDropZone';
import { SourceShelf } from './components/SourceShelf';
import { Verdict, type AddVerdict } from './components/Verdict';
import { EventTail } from './components/EventTail';
import { WorkEditor } from './components/WorkEditor';
import { SuppressionsPanel } from './components/SuppressionsPanel';
import { RunSummary } from './components/RunSummary';
import { GatesPanel, useGatesBadge } from './components/GatesPanel';

const ADD_TAB = '__add__';

type UnitItem = { name: string; riskClass: string; latestStatus: string | null };
type QuotaSnap = { session: number; week: number };
type DaemonStatus = { running: boolean; pid: number | null };
type EventEntry = { name: string; timestamp: string; orchestrationName?: string; runId?: string; payload?: Record<string, unknown> };
type SuppressionRecord = { key: string; orchestrationName: string; reason: string };
type PanelTab = 'run' | 'events' | 'gates';

export function App() {
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [quota, setQuota] = useState<QuotaSnap | null>(null);
  const [externalActive, setExternalActive] = useState(false);
  const [daemon, setDaemon] = useState<DaemonStatus>({ running: false, pid: null });
  const [verdict, setVerdict] = useState<AddVerdict | null>(null);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [suppressions, setSuppressions] = useState<SuppressionRecord[]>([]);

  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('run');
  const [actionBusy, setActionBusy] = useState<string | null>(null);

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
  const gatesBadge = useGatesBadge(activeTab && !isAddTab ? activeTab : null);

  return (
    <div className="frame">
      {/* Titlebar */}
      <div className="titlebar">
        <span>token-smoulder</span>
        <span className="spacer" />
        <span className="dim">external: {externalActive ? 'active' : 'idle'}</span>
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
        />

        {/* Main content area */}
        <div className="main">
          {/* Tab bar */}
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

          {/* Editor area */}
          <div className={`editor${isAddTab || !activeTab ? ' editor--single' : ''}`}>
            {activeTab === null && (
              <div className="placeholder">Select a work item from the sidebar</div>
            )}
            {isAddTab && (
              <div className="pane">
                <div className="pane-body">
                  <AddDropZone onVerdict={(v) => {
                    setVerdict(v);
                    refreshUnits();
                    if (v.name) convertAddTab(v.name);
                  }} />
                  <SourceShelf onSelect={(s) => {
                    api.post<{ kind: string; verdict?: AddVerdict }>('/api/add', { idea: s.title, fileText: s.snippet })
                      .then(r => { if (r.kind === 'verdict' && r.verdict) { setVerdict(r.verdict); refreshUnits(); if (r.verdict.name) convertAddTab(r.verdict.name); } })
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
            )}
            {activeTab && !isAddTab && (
              <>
                <WorkEditor unitName={activeTab} file="work" />
                <WorkEditor unitName={activeTab} file="policy" />
                <WorkEditor unitName={activeTab} file="executor" />
              </>
            )}
          </div>

          {/* Bottom panel */}
          <div className="panel">
            <div className="panel-tabs">
              <div
                className={`panel-tab${panelTab === 'run' ? ' active' : ''}`}
                onClick={() => setPanelTab('run')}
              >
                RUN
                {activeUnit && (
                  <span className={activeUnit.latestStatus === 'failed' ? 'err' : activeUnit.latestStatus === 'completed' ? 'ok' : 'dim'}>
                    {statusLabel(activeUnit.latestStatus)}
                  </span>
                )}
              </div>
              <div
                className={`panel-tab${panelTab === 'events' ? ' active' : ''}`}
                onClick={() => setPanelTab('events')}
              >
                EVENTS
              </div>
              <div
                className={`panel-tab${panelTab === 'gates' ? ' active' : ''}`}
                onClick={() => setPanelTab('gates')}
              >
                GATES
                {gatesBadge && <span className="ok">{gatesBadge}</span>}
              </div>
            </div>
            <div className="panel-body">
              {!activeTab || isAddTab ? (
                <span className="dim">No work item selected</span>
              ) : panelTab === 'run' ? (
                <RunSummary unitName={activeTab} />
              ) : panelTab === 'events' ? (
                <EventTail events={events} filterUnit={activeTab} />
              ) : (
                <GatesPanel unitName={activeTab} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Statusbar */}
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
