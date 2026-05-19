import { QuotaGauge } from './QuotaGauge';
import { DaemonControls } from './DaemonControls';
import type { QueueResponse } from '../App';

type UnitItem = { name: string; riskClass: string; latestStatus: string | null };
type QuotaSnap = { session: number; week: number };
type SuppressionRecord = { key: string; orchestrationName: string; reason: string };
type ClaudeUsage = { fiveHour: number; sevenDay: number; scrapedAt: string };

function timeAgo(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return 'stale';
}

type Props = {
  units: UnitItem[];
  suppressions: SuppressionRecord[];
  activeTab: string | null;
  onOpenTab: (name: string) => void;
  onOpenAddTab: () => void;
  onClearSuppression: (key: string) => void;
  daemon: { running: boolean };
  onRefreshDaemon: () => void;
  quota: QuotaSnap | null;
  claudeUsage: ClaudeUsage | null;
  width: number;
  queueData: QueueResponse | null;
  onForceRun: (name: string) => void;
  onToggleEnabled: (name: string, enabled: boolean) => void;
};

function statusColor(status: string | null): string {
  if (status === 'completed') return 'var(--ok)';
  if (status === 'failed') return 'var(--err)';
  if (status === 'running') return 'var(--blue)';
  if (status === 'suppressed') return 'var(--stopped)';
  if (status === 'skipped') return 'var(--warn)';
  return 'var(--fg-dim)';
}

function statusLabel(status: string | null): string {
  if (!status) return 'never';
  if (status === 'suppressed') return 'stopped';
  return status;
}

function queueStateColor(qs: string): string {
  if (qs === 'running') return 'var(--blue)';
  if (qs === 'done') return 'var(--ok)';
  if (qs === 'failed') return 'var(--err)';
  if (qs === 'suppressed') return 'var(--stopped)';
  if (qs === 'disabled') return 'var(--fg-dim)';
  if (qs === 'cooldown') return 'var(--warn)';
  return 'var(--fg)';
}

function queueStateLabel(qs: string, position: number | null): string {
  if (qs === 'disabled') return 'off';
  if (qs === 'suppressed') return 'stopped';
  if (qs === 'pending' && position === 1) return 'next';
  if (qs === 'pending' && position !== null) return `${position}${position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}`;
  return qs;
}

function formatMs(ms: number): string {
  if (ms < 60_000) return '<1m';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  return rm > 0 ? `${hrs}h ${rm}m` : `${hrs}h`;
}

export function Sidebar({ units, suppressions, activeTab, onOpenTab, onOpenAddTab, onClearSuppression, daemon, onRefreshDaemon, quota, claudeUsage, width, queueData, onForceRun, onToggleEnabled }: Props) {
  const getSuppression = (name: string) =>
    suppressions.find(s => s.orchestrationName === name);

  const getQueueEntry = (name: string) =>
    queueData?.entries.find(e => e.name === name) ?? null;
  const getProximity = (name: string) =>
    queueData?.proximity.find(p => p.name === name) ?? null;

  const sortedUnits = queueData
    ? [...units].sort((a, b) => {
        const pa = getProximity(a.name);
        const pb = getProximity(b.name);
        const sa = pa?.passing ?? -1;
        const sb = pb?.passing ?? -1;
        if (sb !== sa) return sb - sa;
        return a.name.localeCompare(b.name);
      })
    : units;

  const pendingCount = queueData?.entries.filter(e => e.queueState === 'pending').length ?? 0;
  const offCount = queueData?.entries.filter(e => !e.enabled).length ?? 0;

  return (
    <aside className="sidebar" style={{ width }}>
      <h6>
        queue
        {queueData && (
          <span className="queue-summary">{pendingCount} pending{offCount > 0 ? ` · ${offCount} off` : ''}</span>
        )}
      </h6>

      {sortedUnits.map(item => {
        const suppression = getSuppression(item.name);
        const qe = getQueueEntry(item.name);
        const prox = getProximity(item.name);
        const isDisabled = qe ? !qe.enabled : false;
        const qs = qe?.queueState ?? null;
        const blockingGate = prox?.blocking?.[0] ?? null;

        return (
          <div key={item.name} className={isDisabled ? 'unit-row disabled' : 'unit-row'}>
            <div
              className={`unit${activeTab === item.name ? ' active' : ''}`}
              onClick={() => onOpenTab(item.name)}
            >
              <span className="dot" style={{ background: qs ? queueStateColor(qs) : statusColor(item.latestStatus) }} />
              <span className="name">{item.name}</span>
              {qe && (
                <button
                  className="toggle-btn"
                  title={isDisabled ? 'Enable' : 'Disable'}
                  onClick={(e) => { e.stopPropagation(); onToggleEnabled(item.name, !qe.enabled); }}
                >
                  {isDisabled ? '○' : '●'}
                </button>
              )}
              <span
                className={`state${item.latestStatus === null && !qs ? ' state-never' : ''}`}
                style={{ color: qs ? queueStateColor(qs) : statusColor(item.latestStatus) }}
              >
                {qs ? queueStateLabel(qs, prox?.position ?? null) : statusLabel(item.latestStatus)}
              </span>
              <button
                className="force-run-btn"
                title="Run Now (force)"
                onClick={(e) => { e.stopPropagation(); onForceRun(item.name); }}
              >
                ▶
              </button>
            </div>
            {blockingGate && qs === 'pending' && (
              <div className="blocking-info">{blockingGate}</div>
            )}
            {qs === 'cooldown' && qe?.cooldownUntil && (
              <div className="blocking-info" style={{ fontStyle: 'italic', opacity: 0.6 }}>
                est {new Date(qe.cooldownUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {suppression && (
              <div className="stopped-block">
                <div className="stopped-reason">Stopped: repeated failure</div>
                <button
                  className="stopped-clear"
                  onClick={(e) => { e.stopPropagation(); onClearSuppression(suppression.key); }}
                >
                  Clear &amp; retry
                </button>
              </div>
            )}
          </div>
        );
      })}

      {units.length === 0 && (
        <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--fg-dim)' }}>
          No work items found.
        </div>
      )}

      <button className="add-btn" onClick={onOpenAddTab}>
        + Add new work
      </button>

      <div className="sidebar-footer">
        <DaemonControls running={daemon.running} onRefresh={onRefreshDaemon} />
        {queueData?.budget && (
          <div className="budget-bar">
            <div className="budget-bar-track">
              <div
                className={`budget-bar-fill${queueData.budget.exhausted ? ' exhausted' : ''}`}
                style={{ width: `${Math.min(100, Math.round((queueData.budget.consumed / queueData.budget.ceiling) * 100))}%` }}
              />
            </div>
            <span className="budget-label">
              {queueData.budget.exhausted
                ? 'exhausted'
                : `${Math.round((1 - queueData.budget.consumed / queueData.budget.ceiling) * 100)}%`}
              {queueData.budget.cycleResetIn != null && ` · ${formatMs(queueData.budget.cycleResetIn)}`}
            </span>
          </div>
        )}
        {claudeUsage && (
          <div className="claude-usage">
            <span>5h:{Math.round(claudeUsage.fiveHour)}%</span>
            <span>7d:{Math.round(claudeUsage.sevenDay)}%</span>
            <span className="claude-usage-ago">{timeAgo(claudeUsage.scrapedAt)}</span>
          </div>
        )}
        {quota && (
          <>
            <QuotaGauge label="week" value={quota.week} />
            <QuotaGauge label="session" value={quota.session} />
          </>
        )}
      </div>
    </aside>
  );
}

export { statusColor, statusLabel };
