import './app.css';
import { useEffect, useState, useCallback, useRef } from 'react';
import { connectSse } from './lib/sse';
import { api } from './lib/api';
import { ExternalDot } from './components/ExternalDot';
import { Sidebar, statusColor, statusLabel } from './components/Sidebar';
import { AddTab, GhostWorkUnitCTA } from './components/AddTab';
import { WorkEditor } from './components/WorkEditor';
import { RunsPanel } from './components/RunsPanel';
import { HelpPanel } from './components/HelpPanel';

const ADD_TAB = '__add__';
const LS_SIDEBAR = 'ts:sidebar-width';
const LS_PANEL = 'ts:panel-height';
const LS_LAYOUT_PRESET = 'ts:layout-preset';
const LS_PANES = 'ts:panes';
const LS_SHOW_SIDEBAR = 'ts:show-sidebar';
const LS_SHOW_PANEL = 'ts:show-panel';

type LayoutPreset =
  | 'equal'
  | 'work-wide'
  | 'code-wide'
  | 'fullscreen-0'
  | 'fullscreen-1'
  | 'fullscreen-2';

type FileKey = 'work' | 'policy' | 'executor';
const FILE_ORDER: FileKey[] = ['work', 'policy', 'executor'];

type PaneVisibility = Record<FileKey, boolean>;

const PRESET_WEIGHTS: Record<'equal' | 'work-wide' | 'code-wide', Record<FileKey, number>> = {
  'equal': { work: 1, policy: 1, executor: 1 },
  'work-wide': { work: 2, policy: 1, executor: 1 },
  'code-wide': { work: 1, policy: 2, executor: 2 },
};

const PRESET_LABEL: Record<LayoutPreset, string> = {
  'equal': 'Equal',
  'work-wide': 'Work wide',
  'code-wide': 'Code wide',
  'fullscreen-0': 'Fullscreen: work',
  'fullscreen-1': 'Fullscreen: policy',
  'fullscreen-2': 'Fullscreen: executor',
};

const PANE_LABEL: Record<FileKey, string> = {
  work: 'work.md',
  policy: 'policy.ts',
  executor: 'executor.ts',
};

function readLS(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v ? Number(v) : fallback; }
  catch { return fallback; }
}

function readLSBool(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); if (v === null) return fallback; return v === '1'; }
  catch { return fallback; }
}

function readLSString<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {}
  return fallback;
}

function readPaneVisibility(): PaneVisibility {
  try {
    const v = localStorage.getItem(LS_PANES);
    if (v) {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === 'object') {
        return {
          work: parsed.work !== false,
          policy: parsed.policy !== false,
          executor: parsed.executor !== false,
        };
      }
    }
  } catch {}
  return { work: true, policy: true, executor: true };
}

const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  'equal', 'work-wide', 'code-wide', 'fullscreen-0', 'fullscreen-1', 'fullscreen-2',
] as const;

function visibleFilesForLayout(preset: LayoutPreset, visibility: PaneVisibility): FileKey[] {
  if (preset === 'fullscreen-0') return ['work'];
  if (preset === 'fullscreen-1') return ['policy'];
  if (preset === 'fullscreen-2') return ['executor'];
  return FILE_ORDER.filter(f => visibility[f]);
}

function gridTemplateForLayout(preset: LayoutPreset, files: FileKey[]): string {
  if (files.length === 0) return '1fr';
  if (preset === 'fullscreen-0' || preset === 'fullscreen-1' || preset === 'fullscreen-2') {
    return '1fr';
  }
  const weights = PRESET_WEIGHTS[preset];
  return files.map(f => `${weights[f]}fr`).join(' ');
}

type UnitItem = { name: string; riskClass: string; latestStatus: string | null };
type QuotaSnap = { session: number; week: number };
type DaemonStatus = { running: boolean; pid: number | null };
type EventEntry = { name: string; timestamp: string; orchestrationName?: string; runId?: string; payload?: Record<string, unknown> };
type SuppressionRecord = { key: string; orchestrationName: string; reason: string };
type ClaudeUsage = { fiveHour: number; sevenDay: number; scrapedAt: string };

export type QueueEntryState = {
  name: string;
  enabled: boolean;
  lifecycle: 'once' | 'loop';
  queueState: string;
  dailyRunCount: number;
  lastCompletedAt: string | null;
  cooldownUntil: string | null;
};
export type BudgetStatus = {
  ceiling: number;
  consumed: number;
  exhausted: boolean;
  cycleResetIn: number | null;
};
export type QueueResponse = {
  entries: QueueEntryState[];
  budget: BudgetStatus;
  proximity: Array<{ name: string; passing: number; blocking: string[]; position: number | null }>;
};
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
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsage | null>(null);
  const [queueData, setQueueData] = useState<QueueResponse | null>(null);

  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>(
    () => readLSString<LayoutPreset>(LS_LAYOUT_PRESET, LAYOUT_PRESETS, 'equal'),
  );
  const [paneVisibility, setPaneVisibility] = useState<PaneVisibility>(() => readPaneVisibility());
  const [showSidebar, setShowSidebar] = useState<boolean>(() => readLSBool(LS_SHOW_SIDEBAR, true));
  const [showPanel, setShowPanel] = useState<boolean>(() => readLSBool(LS_SHOW_PANEL, true));
  const [panelTab, setPanelTab] = useState<'runs' | 'help'>('runs');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settingsRef = useRef<HTMLDivElement | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { try { localStorage.setItem(LS_LAYOUT_PRESET, layoutPreset); } catch {} }, [layoutPreset]);
  useEffect(() => { try { localStorage.setItem(LS_PANES, JSON.stringify(paneVisibility)); } catch {} }, [paneVisibility]);
  useEffect(() => { try { localStorage.setItem(LS_SHOW_SIDEBAR, showSidebar ? '1' : '0'); } catch {} }, [showSidebar]);
  useEffect(() => { try { localStorage.setItem(LS_SHOW_PANEL, showPanel ? '1' : '0'); } catch {} }, [showPanel]);

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

  const refreshQueue = useCallback(async () => {
    try {
      const data = await api.get<QueueResponse>('/api/queue');
      setQueueData(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshUnits();
    refreshDaemon();
    refreshSuppressions();
    refreshQueue();

    api.get<EventEntry[]>('/api/events?since=1h&limit=200')
      .then(seed => setEvents(seed))
      .catch(() => {});

    api.get<{ payload?: { session?: { percent?: number }; week?: { percent?: number }; scrapedAt?: string } }>('/api/claude-usage')
      .then(data => {
        const p = data.payload;
        if (p?.session?.percent != null && p?.week?.percent != null) {
          setClaudeUsage({ fiveHour: p.session.percent, sevenDay: p.week.percent, scrapedAt: p.scrapedAt ?? '' });
        }
      })
      .catch(() => {});

    const disconnect = connectSse('/events', ['units', 'quota', 'external', 'event', 'claude-usage'], (event, data) => {
      try {
        const parsed = JSON.parse(data);
        if (event === 'units') { setUnits(parsed.items); refreshSuppressions(); refreshQueue(); }
        if (event === 'quota') setQuota({ session: parsed.session, week: parsed.week });
        if (event === 'external') setExternalActive(parsed.active);
        if (event === 'claude-usage') {
          const p = parsed.payload;
          if (p?.session?.percent != null && p?.week?.percent != null) {
            setClaudeUsage({ fiveHour: p.session.percent, sevenDay: p.week.percent, scrapedAt: p.scrapedAt ?? '' });
          }
        }
        if (event === 'event') setEvents(prev => {
          if (prev.some(e => e.timestamp === parsed.timestamp && e.name === parsed.name && e.orchestrationName === parsed.orchestrationName)) return prev;
          return [...prev.slice(-199), parsed];
        });
      } catch { /* ignore malformed */ }
    });

    return disconnect;
  }, [refreshUnits, refreshDaemon, refreshSuppressions, refreshQueue]);

  useEffect(() => {
    if (units.length > 0 && openTabs.length === 0) {
      openTab(units[0].name);
    }
  }, [units]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setShowSidebar(v => !v);
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setShowPanel(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (settingsRef.current?.contains(target)) return;
      if (settingsBtnRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSettingsOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

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

  const togglePaneVisibility = (key: FileKey) => {
    setPaneVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const anyVisible = next.work || next.policy || next.executor;
      if (!anyVisible) return prev;
      return next;
    });
  };

  const [runResult, setRunResult] = useState<'ok' | 'fail' | null>(null);

  const runUnit = async (name: string) => {
    setActionBusy('run');
    setRunResult(null);
    let failed = false;
    try {
      const res = await api.post<{ status?: string }>(`/api/units/${encodeURIComponent(name)}/run`);
      const s = res && typeof res === 'object' && 'status' in res ? res.status : '';
      if (s === 'completed' || s === 'dry-run') {
        setRunResult('ok');
      } else {
        failed = true;
        setRunResult('fail');
      }
    } catch {
      failed = true;
      setRunResult('fail');
    }
    setActionBusy(null);
    refreshUnits();
    setEvents(prev => [...prev, {
      name: failed ? 'run_failed' : 'run_completed',
      timestamp: new Date().toISOString(),
      orchestrationName: name,
    }]);
    setTimeout(() => setRunResult(null), 8000);
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
  const isEmptyState = units.length === 0 && !isAddTab;
  const visibleFiles = visibleFilesForLayout(layoutPreset, paneVisibility);
  const gridTemplate = gridTemplateForLayout(layoutPreset, visibleFiles);
  const editorSingleClass = (isAddTab || !activeTab || isEmptyState || visibleFiles.length <= 1)
    ? ' editor--single' : '';

  const onlyVisiblePane = (() => {
    const visibleKeys = (Object.keys(paneVisibility) as FileKey[]).filter(k => paneVisibility[k]);
    return visibleKeys.length === 1 ? visibleKeys[0] : null;
  })();

  return (
    <div className="frame">
      <div className="titlebar">
        <span>token-smoulder</span>
        <span className="spacer" />
        <ExternalDot active={externalActive} />
        <button
          ref={settingsBtnRef}
          className={`btn ghost settings-cog${settingsOpen ? ' active' : ''}`}
          title="Layout settings"
          onClick={() => setSettingsOpen(v => !v)}
        >
          ⚙
        </button>
        <button
          className={`btn primary${runResult === 'fail' ? ' btn-fail' : ''}${runResult === 'ok' ? ' btn-ok' : ''}`}
          disabled={!activeUnit || actionBusy !== null}
          onClick={() => activeUnit && runUnit(activeUnit.name)}
        >
          {actionBusy === 'run' ? 'Running...' : runResult === 'fail' ? '✗ Failed' : runResult === 'ok' ? '✓ Done' : 'Run'}
        </button>
        <button
          className="btn ghost"
          disabled={!activeUnit || actionBusy !== null}
          title="Remove the lock file so this work unit can be dispatched again"
          onClick={() => activeUnit && unlockUnit(activeUnit.name)}
        >
          Unlock
        </button>
      </div>

      {settingsOpen && (
        <div ref={settingsRef} className="settings-popover">
          <div className="settings-section-label">Layout</div>
          <div className="settings-options">
            {LAYOUT_PRESETS.map(p => (
              <label key={p} className="settings-option">
                <input
                  type="radio"
                  name="layout-preset"
                  checked={layoutPreset === p}
                  onChange={() => setLayoutPreset(p)}
                />
                <span>{PRESET_LABEL[p]}</span>
              </label>
            ))}
          </div>
          <div className="settings-section-label">Panes</div>
          <div className="settings-options">
            {FILE_ORDER.map(key => {
              const disabled = onlyVisiblePane === key;
              return (
                <label key={key} className={`settings-option${disabled ? ' disabled' : ''}`}>
                  <input
                    type="checkbox"
                    checked={paneVisibility[key]}
                    disabled={disabled}
                    onChange={() => togglePaneVisibility(key)}
                  />
                  <span>{PANE_LABEL[key]}</span>
                </label>
              );
            })}
          </div>
          <div className="settings-hint">⌘B sidebar · ⌘J panel</div>
        </div>
      )}

      <div className="body">
        {showSidebar && (
          <>
            <Sidebar
              units={units}
              suppressions={suppressions}
              activeTab={activeTab}
              onOpenTab={openTab}
              onOpenAddTab={() => openTab(ADD_TAB)}
              onClearSuppression={async (key: string) => {
                await api.post(`/api/units/_/clear-suppression`, { key }).catch(() => {});
                refreshSuppressions();
                refreshUnits();
              }}
              daemon={daemon}
              onRefreshDaemon={refreshDaemon}
              quota={quota}
              claudeUsage={claudeUsage}
              width={sidebar.size}
              queueData={queueData}
              onForceRun={async (name: string) => {
                await api.post(`/api/units/${encodeURIComponent(name)}/force-run`).catch(() => {});
                refreshUnits();
                refreshQueue();
              }}
              onToggleEnabled={async (name: string, enabled: boolean) => {
                await api.patch(`/api/queue/entries/${encodeURIComponent(name)}`, { enabled }).catch(() => {});
                refreshQueue();
              }}
            />
            <div className="resize-h" onMouseDown={sidebar.onMouseDown} />
          </>
        )}

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

          <div
            className={`editor${editorSingleClass}`}
            style={
              isAddTab || !activeTab || isEmptyState
                ? undefined
                : { gridTemplateColumns: gridTemplate }
            }
          >
            {isEmptyState && (
              <div className="pane">
                <div className="pane-body">
                  <GhostWorkUnitCTA onClick={() => openTab(ADD_TAB)} />
                </div>
              </div>
            )}
            {!isEmptyState && activeTab === null && (
              <div className="placeholder">Select a work item from the sidebar</div>
            )}
            {isAddTab && (
              <div className="pane">
                <div className="pane-body">
                  <AddTab
                    onConverted={convertAddTab}
                    onRefreshUnits={refreshUnits}
                    unitsEmpty={units.length === 0}
                  />
                </div>
              </div>
            )}
            {activeTab && !isAddTab && visibleFiles.map(file => (
              <WorkEditor key={file} unitName={activeTab} file={file} />
            ))}
          </div>

          {showPanel && (
            <>
              <div className="resize-v" onMouseDown={panel.onMouseDown} />

              <div className="panel" style={{ height: panel.size }}>
                <div className="panel-tabs">
                  <div
                    className={`panel-tab${panelTab === 'runs' ? ' active' : ''}`}
                    onClick={() => setPanelTab('runs')}
                  >
                    Runs
                  </div>
                  <div
                    className={`panel-tab${panelTab === 'help' ? ' active' : ''}`}
                    onClick={() => setPanelTab('help')}
                  >
                    Help
                  </div>
                </div>
                {panelTab === 'runs' ? (
                  <RunsPanel
                    units={units}
                    events={events}
                    focusedUnit={activeTab && !isAddTab ? activeTab : null}
                    onSelectUnit={openTab}
                  />
                ) : (
                  <HelpPanel />
                )}
              </div>
            </>
          )}
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
