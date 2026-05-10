import { useEffect, useState } from 'react';
import { api } from '../lib/api';

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

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(); }
  catch { return iso; }
}

export function RunSummary({ unitName }: Props) {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRun(null);
    setNotFound(false);
    setError(null);

    api.get<RunRecord>(`/api/units/${encodeURIComponent(unitName)}/state`)
      .then(data => setRun(data))
      .catch(e => {
        if (String(e).includes('404')) { setNotFound(true); return; }
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [unitName]);

  if (error) return <span className="err">Failed to load run: {error}</span>;
  if (notFound) return <span className="dim">Never run</span>;
  if (!run) return <span className="dim">Loading...</span>;

  const totalSteps = run.steps.length;

  return (
    <>
      <span className="dim">
        run {run.runId.slice(0, 7)} · {formatTime(run.startedAt)} · {totalSteps} step{totalSteps !== 1 ? 's' : ''}
        {' · '}{relativeTime(run.endedAt ?? run.startedAt)}
      </span>
      {'\n\n'}
      {run.steps.map(step => {
        const isFailed = step.status === 'failed';
        const isSkipped = step.status === 'skipped';
        return (
          <div key={step.index}>
            {isFailed ? (
              <>
                <span>step {step.index + 1}/{totalSteps} </span>
                <span className="err">✗ FAILED</span>
                {'\n'}
                <span className="dim">  prompt: {step.prompt}</span>
                {'\n'}
                {step.error && (
                  <span className="err-block">
                    <span className="err-source">
                      {run.failureSignature ? run.failureSignature.split('\n')[0] : 'process failed'}
                    </span>
                    {'\n'}
                    {step.error}
                  </span>
                )}
              </>
            ) : isSkipped ? (
              <span className="dim">step {step.index + 1}/{totalSteps} skipped (prev failed)</span>
            ) : (
              <>
                <span>step {step.index + 1}/{totalSteps} </span>
                <span className="ok">✓ {step.status}</span>
                {step.prompt && (
                  <>
                    {'\n'}
                    <span className="dim">  prompt: {step.prompt}</span>
                  </>
                )}
              </>
            )}
            {'\n'}
          </div>
        );
      })}
    </>
  );
}

export type { RunRecord };
