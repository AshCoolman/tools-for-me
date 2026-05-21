import { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import { friendlyGateName, RISK_HELP } from '../lib/help';
import { PREDICATE_TO_GATE } from '../lib/predicate-map';

type Step = {
  index: number;
  prompt: string;
  status: string;
  error?: string;
};

type Decision = {
  shouldRun: boolean;
  reasons: string[];
  failedReasons: string[];
};

type Interpretation = {
  ruleId: string | null;
  explanation?: string;
  remediation?: string;
  status: 'matched' | 'unmatched' | 'pending';
};

type RunRecord = {
  runId: string;
  orchestrationName: string;
  status: string;
  riskClass: string;
  startedAt: string;
  endedAt?: string;
  steps: Step[];
  failureSignature?: string;
  interpretation?: Interpretation;
  decision: Decision;
};

type EventEntry = {
  name: string;
  timestamp: string;
  orchestrationName?: string;
  runId?: string;
};

type Props = {
  units: { name: string }[];
  events: EventEntry[];
  focusedUnit: string | null;
  onSelectUnit?: (name: string) => void;
  focusedGate?: string | null;
  onGateClick?: (gateName: string) => void;
};

const RUN_EVENTS = new Set([
  'run_started', 'prompt_started', 'prompt_completed',
  'run_completed', 'run_failed', 'run_suppressed',
]);

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function formatDuration(startIso: string, endIso?: string): string {
  if (!endIso) return '';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(); }
  catch { return iso; }
}

function statusIcon(status: string): { char: string; cls: string } {
  switch (status) {
    case 'completed': return { char: '✓', cls: 'completed' };
    case 'failed': return { char: '!', cls: 'failed' };
    case 'running': return { char: '●', cls: 'running' };
    default: return { char: '○', cls: 'blocked' };
  }
}

function stepStatusCls(status: string): string {
  switch (status) {
    case 'completed': return 'ok';
    case 'failed': return 'fail';
    case 'running': return 'active';
    default: return 'pending';
  }
}

function stepStatusChar(status: string): React.ReactNode {
  switch (status) {
    case 'completed': return '✓';
    case 'failed': return '✗';
    case 'running': return <span className="spinner">{'◡'}</span>;
    case 'skipped': return '○';
    default: return '○';
  }
}

function Pipeline({ decision, steps, focusedGate }: { decision: Decision; steps: Step[]; focusedGate?: string | null }) {
  const passedCount = decision.reasons.length;
  const failedCount = decision.failedReasons.length;
  const totalGates = passedCount + failedCount;
  const allPassed = failedCount === 0;

  const threadWidth = allPassed
    ? totalGates * 7 + 8
    : passedCount * 7;

  const threadClass = allPassed ? 'live' : 'blocked';
  const stepsBlocked = !decision.shouldRun;

  return (
    <div className="pipeline">
      <div
        className={`thread ${threadClass}`}
        style={{ width: `${threadWidth}px` }}
      />
      {decision.reasons.map((reason, i) => (
        <span
          key={`o${i}`}
          className={`gate open${focusedGate && PREDICATE_TO_GATE[reason] === focusedGate ? ' gate-highlight' : ''}`}
        />
      ))}
      {decision.failedReasons.map((reason, i) => (
        <span
          key={`c${i}`}
          className={`gate closed${focusedGate && PREDICATE_TO_GATE[reason] === focusedGate ? ' gate-highlight' : ''}`}
        />
      ))}
      <span className="pipe-gap" />
      {steps.map((step, i) => {
        let cls = 'pending';
        if (stepsBlocked) {
          cls = 'blocked';
        } else {
          switch (step.status) {
            case 'completed': cls = 'done'; break;
            case 'running': cls = 'active'; break;
            case 'failed': cls = 'fail'; break;
            default: cls = 'pending'; break;
          }
        }
        return <span key={i} className={`step-seg ${cls}`} />;
      })}
    </div>
  );
}

function RunDetail({ run, focusedGate, onGateClick }: { run: RunRecord; focusedGate?: string | null; onGateClick?: (gate: string) => void }) {
  const isFailed = run.status === 'failed';
  const isRunning = run.status === 'running';
  const detailClass = [
    'run-detail',
    isFailed && 'detail-failed',
    isRunning && 'detail-running',
  ].filter(Boolean).join(' ');

  const totalSteps = run.steps.length;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusedGate || !containerRef.current) return;
    const el = containerRef.current.querySelector('.gate-row-highlight') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedGate]);

  return (
    <div className={detailClass} ref={containerRef}>
      <div className="detail-meta">
        <span><span className="label">run</span> {run.runId.slice(0, 8)}</span>
        <span><span className="label">risk</span> {run.riskClass}</span>
        <span><span className="label">started</span> {formatTime(run.startedAt)}</span>
        {run.endedAt && (
          <span><span className="label">duration</span> {formatDuration(run.startedAt, run.endedAt)}</span>
        )}
      </div>
      <div className="detail-section-label">steps</div>
      {run.steps.map(step => (
        <div key={step.index}>
          <div className="step-row">
            <span className="step-idx">{step.index + 1}/{totalSteps}</span>
            <span className={`d-step-status ${stepStatusCls(step.status)}`}>
              {stepStatusChar(step.status)}
            </span>
            <span className="step-prompt">"{step.prompt}"{step.status === 'skipped' ? ' — skipped' : ''}</span>
          </div>
          {step.error && <div className="step-error">{step.error}</div>}
        </div>
      ))}
      {run.interpretation?.explanation && (
        <>
          <div className="detail-section-label">interpretation</div>
          <div className="interpretation">
            <div className="interp-explanation">{run.interpretation.explanation}</div>
            <div className="interp-remediation">{run.interpretation.remediation}</div>
          </div>
        </>
      )}
      {run.interpretation?.status === 'pending' && (
        <>
          <div className="detail-section-label">interpretation</div>
          <div className="interpretation">
            <span className="dim">interpreting error...</span>
          </div>
        </>
      )}
      <div className="detail-section-label">gates</div>
      {run.decision.reasons.map((r, i) => {
        const gate = PREDICATE_TO_GATE[r] ?? r;
        const highlighted = focusedGate && PREDICATE_TO_GATE[r] === focusedGate;
        return (
          <div
            key={`p${i}`}
            className={`gate-row${highlighted ? ' gate-row-highlight' : ''}`}
            onClick={() => onGateClick?.(gate)}
          >
            <span className="gate-name">{friendlyGateName(r)}</span>
            <span className="ok">{'✓'}</span>
          </div>
        );
      })}
      {run.decision.failedReasons.map((r, i) => {
        const gate = PREDICATE_TO_GATE[r] ?? r;
        const highlighted = focusedGate && PREDICATE_TO_GATE[r] === focusedGate;
        return (
          <div
            key={`f${i}`}
            className={`gate-row${highlighted ? ' gate-row-highlight' : ''}`}
            onClick={() => onGateClick?.(gate)}
          >
            <span className="gate-name">{friendlyGateName(r)}</span>
            <span className="err">{'✗'} {r}</span>
          </div>
        );
      })}
    </div>
  );
}

function RunRow({ run, pinned, expanded, fresh, focused, focusedGate, onTogglePin, onToggleExpand, onSelectUnit, onDismiss, onKill, onGateClick }: {
  run: RunRecord;
  pinned: boolean;
  expanded: boolean;
  fresh: boolean;
  focused: boolean;
  focusedGate?: string | null;
  onTogglePin: (id: string, e: React.MouseEvent) => void;
  onToggleExpand: (id: string) => void;
  onSelectUnit?: (name: string) => void;
  onDismiss: (id: string, e: React.MouseEvent) => void;
  onKill: (name: string, e: React.MouseEvent) => void;
  onGateClick?: (gate: string) => void;
}) {
  const isFailed = run.status === 'failed';
  const isRunning = run.status === 'running';

  const rowClasses = [
    'run-row',
    isFailed && 'is-failed',
    isRunning && 'is-running',
    expanded && 'selected',
    focused && 'focused',
    fresh && 'fresh',
  ].filter(Boolean).join(' ');

  const icon = statusIcon(run.status);
  const failedStep = run.steps.find(s => s.status === 'failed');
  const errorText = failedStep?.error || run.failureSignature || '';
  const gateError = !run.decision.shouldRun && run.decision.failedReasons.length > 0
    ? run.decision.failedReasons[0]
    : '';
  const displayError = errorText || gateError;

  return (
    <>
      <div
        className={rowClasses}
        onClick={() => { onToggleExpand(run.runId); onSelectUnit?.(run.orchestrationName); }}
      >
        <span className={`run-status ${icon.cls}`}>{icon.char}</span>
        <span className="run-unit">{run.orchestrationName}</span>
        <Pipeline decision={run.decision} steps={run.steps} focusedGate={focusedGate} />
        <span
          className="run-risk"
          title={RISK_HELP[run.riskClass] ?? run.riskClass}
        >{run.riskClass}</span>
        {displayError ? (
          <span className="run-error">{displayError}</span>
        ) : (
          <span className="run-spacer" />
        )}
        <span className="run-time">{relativeTime(run.startedAt)}</span>
        <span className="run-duration">{formatDuration(run.startedAt, run.endedAt)}</span>
        {isRunning && (
          <span
            className="run-kill"
            title="Kill"
            onClick={(e) => onKill(run.orchestrationName, e)}
          >
            {'■'}
          </span>
        )}
        <span
          className="run-dismiss"
          title="Dismiss"
          onClick={(e) => onDismiss(run.runId, e)}
        >
          {'×'}
        </span>
        <span
          className={`run-pin${pinned ? ' pinned' : ''}`}
          title={pinned ? 'Unpin' : 'Pin'}
          onClick={(e) => onTogglePin(run.runId, e)}
        >
          {'📌'}
        </span>
      </div>
      {expanded && <RunDetail run={run} focusedGate={focusedGate} onGateClick={onGateClick} />}
    </>
  );
}

export function RunsPanel({ units, events, focusedUnit, onSelectUnit, focusedGate, onGateClick }: Props) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | string>('all');
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const prevEventsLen = useRef(0);
  const fetchedUnits = useRef(new Set<string>());

  const fetchUnitRuns = (name: string) =>
    api.get<RunRecord[]>(`/api/units/${encodeURIComponent(name)}/runs`)
      .catch(() => [] as RunRecord[]);

  useEffect(() => {
    const newUnits = units.filter(u => !fetchedUnits.current.has(u.name));
    if (newUnits.length === 0) return;
    for (const u of newUnits) fetchedUnits.current.add(u.name);

    Promise.all(newUnits.map(u => fetchUnitRuns(u.name))).then(results => {
      const newRuns = results.flat();
      setRuns(prev => {
        const byId = new Map(prev.map(r => [r.runId, r]));
        for (const r of newRuns) byId.set(r.runId, r);
        const merged = [...byId.values()];
        merged.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        return merged;
      });
    });
  }, [units]);

  useEffect(() => {
    const newLen = events.length;
    if (newLen <= prevEventsLen.current) {
      prevEventsLen.current = newLen;
      return;
    }
    const newEvents = events.slice(prevEventsLen.current);
    prevEventsLen.current = newLen;

    const toRefetch = new Set<string>();
    for (const ev of newEvents) {
      if (RUN_EVENTS.has(ev.name) && ev.orchestrationName) {
        toRefetch.add(ev.orchestrationName);
      }
    }
    for (const name of toRefetch) {
      fetchUnitRuns(name).then(updated => {
        setRuns(prev => {
          const byId = new Map(prev.filter(r => r.orchestrationName !== name).map(r => [r.runId, r]));
          for (const r of updated) byId.set(r.runId, r);
          const merged = [...byId.values()];
          merged.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
          const justFailed = updated.find(r => r.status === 'failed' && !prev.find(p => p.runId === r.runId && p.status === 'failed'));
          if (justFailed) setExpandedId(justFailed.runId);
          const newIds = updated.map(r => r.runId);
          setFreshIds(prev => { const next = new Set(prev); newIds.forEach(id => next.add(id)); return next; });
          setTimeout(() => setFreshIds(prev => { const next = new Set(prev); newIds.forEach(id => next.delete(id)); return next; }), 2000);
          return merged;
        });
      });
    }
  }, [events]);

  const togglePin = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  const toggleExpand = (runId: string) => {
    setExpandedId(prev => prev === runId ? null : runId);
  };

  const kill = (orchestrationName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    api.post(`/api/units/${encodeURIComponent(orchestrationName)}/kill`).catch(() => {});
  };

  const dismiss = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(prev => { const next = new Set(prev); next.add(runId); return next; });
    if (expandedId === runId) setExpandedId(null);
  };

  const dismissAll = () => {
    const ids = visible
      .filter(r => !pinnedIds.has(r.runId) && r.status !== 'running')
      .map(r => r.runId);
    if (ids.length === 0) return;
    setDismissedIds(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
    if (expandedId && ids.includes(expandedId)) setExpandedId(null);
  };

  const filtered = filter === 'all'
    ? runs
    : runs.filter(r => r.orchestrationName === filter || pinnedIds.has(r.runId));

  const visible = filtered.filter(r => !dismissedIds.has(r.runId));
  const dismissed = filtered.filter(r => dismissedIds.has(r.runId));

  const pinned = visible.filter(r => pinnedIds.has(r.runId));
  const unpinned = visible.filter(r => !pinnedIds.has(r.runId));
  const unitNames = [...new Set<string>([
    ...units.map(u => u.name),
    ...runs.map(r => r.orchestrationName),
  ])].sort();
  const filteredUnitHasNoRuns = filter !== 'all' && !runs.some(r => r.orchestrationName === filter);

  return (
    <>
      <div className="runs-panel-header">
        <span className="panel-title">RUNS</span>
        <span className="sep">|</span>
        <span className="filter-label">filter:</span>
        <button
          className={`filter${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          all
        </button>
        {unitNames.map(name => (
          <button
            key={name}
            className={`filter${filter === name ? ' active' : ''}`}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
        {visible.filter(r => !pinnedIds.has(r.runId) && r.status !== 'running').length > 0 && (
          <button className="filter dismiss-all-btn" onClick={dismissAll}>dismiss all</button>
        )}
      </div>
      <div className="runs-list">
        {pinned.map(run => (
          <RunRow
            key={run.runId}
            run={run}
            pinned={true}
            expanded={expandedId === run.runId}
            fresh={freshIds.has(run.runId)}
            focused={focusedUnit !== null && run.orchestrationName === focusedUnit}
            focusedGate={focusedGate}
            onTogglePin={togglePin}
            onToggleExpand={toggleExpand}
            onSelectUnit={onSelectUnit}
            onDismiss={dismiss}
            onKill={kill}
            onGateClick={onGateClick}
          />
        ))}
        {pinned.length > 0 && unpinned.length > 0 && <div className="pin-divider" />}
        {unpinned.map(run => (
          <RunRow
            key={run.runId}
            run={run}
            pinned={false}
            expanded={expandedId === run.runId}
            fresh={freshIds.has(run.runId)}
            focused={focusedUnit !== null && run.orchestrationName === focusedUnit}
            focusedGate={focusedGate}
            onTogglePin={togglePin}
            onToggleExpand={toggleExpand}
            onSelectUnit={onSelectUnit}
            onDismiss={dismiss}
            onKill={kill}
            onGateClick={onGateClick}
          />
        ))}
        {visible.length === 0 && dismissed.length === 0 && (
          <div className="placeholder runs-empty">
            {filteredUnitHasNoRuns ? `${filter} has not run yet` : 'No runs'}
          </div>
        )}
        {dismissed.length > 0 && (
          <div
            className="dismissed-bar"
            onClick={() => setShowDismissed(prev => !prev)}
          >
            <span className="dismissed-count">{dismissed.length} dismissed</span>
            <span className="dismissed-chevron">{showDismissed ? '▾' : '▸'}</span>
          </div>
        )}
        {showDismissed && dismissed.map(run => (
          <RunRow
            key={run.runId}
            run={run}
            pinned={pinnedIds.has(run.runId)}
            expanded={expandedId === run.runId}
            fresh={false}
            focused={focusedUnit !== null && run.orchestrationName === focusedUnit}
            focusedGate={focusedGate}
            onTogglePin={togglePin}
            onToggleExpand={toggleExpand}
            onSelectUnit={onSelectUnit}
            onDismiss={dismiss}
            onKill={kill}
            onGateClick={onGateClick}
          />
        ))}
      </div>
    </>
  );
}
