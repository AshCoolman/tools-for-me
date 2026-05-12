import { QuotaGauge } from './QuotaGauge';
import { DaemonControls } from './DaemonControls';

type UnitItem = { name: string; riskClass: string; latestStatus: string | null };
type QuotaSnap = { session: number; week: number };
type SuppressionRecord = { key: string; orchestrationName: string; reason: string };

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
  width: number;
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
  if (!status) return '—';
  if (status === 'suppressed') return 'stopped';
  return status;
}

export function Sidebar({ units, suppressions, activeTab, onOpenTab, onOpenAddTab, onClearSuppression, daemon, onRefreshDaemon, quota, width }: Props) {
  const getSuppression = (name: string) =>
    suppressions.find(s => s.orchestrationName === name);

  return (
    <aside className="sidebar" style={{ width }}>
      <h6>work</h6>

      {units.map(item => {
        const suppression = getSuppression(item.name);
        return (
          <div key={item.name}>
            <div
              className={`unit${activeTab === item.name ? ' active' : ''}`}
              onClick={() => onOpenTab(item.name)}
            >
              <span className="dot" style={{ background: statusColor(item.latestStatus) }} />
              <span className="name">{item.name}</span>
              <span className="risk-chip">{item.riskClass}</span>
              <span className="state" style={{ color: statusColor(item.latestStatus) }}>
                {statusLabel(item.latestStatus)}
              </span>
            </div>
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
