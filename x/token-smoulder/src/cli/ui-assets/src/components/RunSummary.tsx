import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';
import { ShortId } from './ShortId';

type Step = {
  index: number;
  prompt: string;
  status: string;
  error?: string;
};

type Decision = {
  reasons: string[];
  failedReasons: string[];
};

type RunRecord = {
  runId: string;
  status: string;
  riskClass: string;
  startedAt: string;
  endedAt?: string;
  steps: Step[];
  failureSignature?: string;
  decision: Decision;
};

type Props = {
  unitName: string;
};

export function RunSummary({ unitName }: Props) {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReasons, setShowReasons] = useState(false);

  useEffect(() => {
    setRun(null);
    setNotFound(false);
    setError(null);
    setShowReasons(false);

    fetch(`/api/units/${encodeURIComponent(unitName)}/state`)
      .then(res => {
        if (res.status === 404) { setNotFound(true); return null; }
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<RunRecord>;
      })
      .then(data => { if (data) setRun(data); })
      .catch(e => setError(String(e)));
  }, [unitName]);

  if (error) return <div style={errorStyle}>Failed to load run: {error}</div>;
  if (notFound) return <div style={emptyStyle}>Never run</div>;
  if (!run) return <div style={emptyStyle}>Loading...</div>;

  return (
    <div style={container}>
      <div style={headerRow}>
        <span style={statusBadge(run.status)}>{run.status}</span>
        <span style={timeStyle}>{relativeTime(run.endedAt ?? run.startedAt)}</span>
        <ShortId value={run.runId} />
      </div>

      {run.failureSignature && (
        <div style={errorBlock}>
          <div style={errorLabel}>Error</div>
          <pre style={errorPre}>{run.failureSignature}</pre>
        </div>
      )}

      <div style={sectionStyle}>
        <div style={sectionLabel}>Steps</div>
        {run.steps.map(step => (
          <div key={step.index} style={stepRow}>
            <span style={stepGlyph(step.status)}>{stepIcon(step.status)}</span>
            <span style={stepIndex}>{step.index + 1}.</span>
            <span style={stepPrompt} title={step.prompt}>
              {step.prompt.length > 80 ? step.prompt.slice(0, 80) + '...' : step.prompt}
            </span>
            {step.error && step.error !== run.failureSignature && (
              <div style={stepError}>{step.error}</div>
            )}
          </div>
        ))}
      </div>

      <div style={sectionStyle}>
        <button
          onClick={() => setShowReasons(v => !v)}
          style={toggleBtn}
        >
          {showReasons ? '▾' : '▸'} Dispatch reasons ({run.decision.reasons.length})
        </button>
        {showReasons && (
          <ul style={reasonList}>
            {run.decision.reasons.map((r, i) => (
              <li key={i} style={reasonItem}>{r}</li>
            ))}
            {run.decision.failedReasons.map((r, i) => (
              <li key={`f${i}`} style={{ ...reasonItem, color: '#d66' }}>✗ {r}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function stepIcon(status: string): string {
  if (status === 'completed') return '✓';
  if (status === 'failed') return '✗';
  if (status === 'running') return '▸';
  return '·';
}

function statusBadge(status: string): CSSProperties {
  const color =
    status === 'completed' ? '#6d6' :
    status === 'failed' ? '#d66' :
    status === 'running' ? '#6bd' :
    status === 'skipped' || status === 'suppressed' ? '#888' :
    '#dd6';
  const bg =
    status === 'completed' ? '#1a2e1a' :
    status === 'failed' ? '#2e1a1a' :
    '#2a2a1a';
  return { color, background: bg, padding: '0.15rem 0.5rem', borderRadius: 3, fontSize: '0.8rem', fontWeight: 600 };
}

function stepGlyph(status: string): CSSProperties {
  const color =
    status === 'completed' ? '#6d6' :
    status === 'failed' ? '#d66' :
    status === 'running' ? '#6bd' :
    '#666';
  return { color, fontWeight: 600, width: 14, display: 'inline-block', flexShrink: 0 };
}

const container: CSSProperties = { fontSize: '0.8rem' };
const headerRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' };
const timeStyle: CSSProperties = { color: '#888', fontSize: '0.75rem' };

const errorBlock: CSSProperties = { background: '#2a1a1a', border: '1px solid #442222', borderRadius: 4, padding: '0.5rem', marginBottom: '0.75rem' };
const errorLabel: CSSProperties = { color: '#d66', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' };
const errorPre: CSSProperties = { margin: 0, fontSize: '0.75rem', color: '#eaa', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' };

const sectionStyle: CSSProperties = { marginBottom: '0.75rem' };
const sectionLabel: CSSProperties = { color: '#888', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' };
const stepRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '0.3rem', padding: '0.2rem 0', fontSize: '0.75rem' };
const stepIndex: CSSProperties = { color: '#666', width: 16, flexShrink: 0, textAlign: 'right' };
const stepPrompt: CSSProperties = { color: '#bbb', cursor: 'default' };
const stepError: CSSProperties = { color: '#d88', fontSize: '0.7rem', marginTop: '0.15rem', marginLeft: 30, fontFamily: 'monospace' };

const toggleBtn: CSSProperties = { background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0, fontSize: '0.75rem' };
const reasonList: CSSProperties = { margin: '0.3rem 0 0', padding: '0 0 0 1rem', listStyle: 'none' };
const reasonItem: CSSProperties = { color: '#999', fontSize: '0.7rem', padding: '0.1rem 0' };

const emptyStyle: CSSProperties = { color: '#666', fontSize: '0.8rem' };
const errorStyle: CSSProperties = { color: '#d66', fontSize: '0.8rem' };
