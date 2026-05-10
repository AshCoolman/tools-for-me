import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Decision = {
  reasons: string[];
  failedReasons: string[];
};

type StateRecord = {
  decision: Decision;
};

type Props = {
  unitName: string;
};

function friendlyGateName(raw: string): string {
  return raw
    .replace(/^(pass|fail|gate)[:_-]\s*/i, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .trim()
    .toLowerCase();
}

export function GatesPanel({ unitName }: Props) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDecision(null);
    setNotFound(false);
    setError(null);

    api.get<StateRecord>(`/api/units/${encodeURIComponent(unitName)}/state`)
      .then(data => setDecision(data.decision))
      .catch(e => {
        if (String(e).includes('404')) { setNotFound(true); return; }
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [unitName]);

  if (error) return <span className="err">Failed to load gates: {error}</span>;
  if (notFound) return <span className="dim">Never run — no gate data</span>;
  if (!decision) return <span className="dim">Loading...</span>;

  const passed = decision.reasons.length;
  const failed = decision.failedReasons.length;
  const total = passed + failed;

  return (
    <>
      <span className="dim">{passed}/{total} passed</span>
      {'\n\n'}
      {decision.reasons.map((r, i) => (
        <div key={`p${i}`} className="gate-row">
          <span className="ok">✓</span>
          <span className="gate-name">{friendlyGateName(r)}</span>
          <span className="gate-reason">{r}</span>
        </div>
      ))}
      {decision.failedReasons.map((r, i) => (
        <div key={`f${i}`} className="gate-row">
          <span className="err">✗</span>
          <span className="gate-name">{friendlyGateName(r)}</span>
          <span className="gate-reason">{r}</span>
        </div>
      ))}
    </>
  );
}

export function useGatesBadge(unitName: string | null): string | null {
  const [badge, setBadge] = useState<string | null>(null);

  useEffect(() => {
    if (!unitName) { setBadge(null); return; }

    api.get<StateRecord>(`/api/units/${encodeURIComponent(unitName)}/state`)
      .then(data => {
        const p = data.decision.reasons.length;
        const t = p + data.decision.failedReasons.length;
        setBadge(`${p}/${t} ✓`);
      })
      .catch(() => setBadge(null));
  }, [unitName]);

  return badge;
}
