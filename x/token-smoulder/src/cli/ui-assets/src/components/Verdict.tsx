import type { CSSProperties } from 'react';
import { api } from '../lib/api';

type LintIssue = { rule: string; message: string };
type LintReport = { ok: boolean; name: string; issues: LintIssue[] };
type LintField = LintReport | { boundary: string };
type CheckDecision = { shouldRun: boolean; reasons: string[]; failedReasons: string[]; riskClass: string };
type CheckField = CheckDecision | { boundary: string } | { skipped: string };

export type AddVerdict = {
  name: string;
  oneLiner: string | null;
  scaffolded: boolean;
  inferred: { riskClass: string; signal: string } | null;
  policy: { allowlist: string[] };
  lint: LintField;
  check: CheckField;
  next: string;
};

type Props = {
  verdict: AddVerdict;
  onDismiss: () => void;
  onRefresh: () => void;
};

export function Verdict({ verdict, onDismiss, onRefresh }: Props) {
  const { name, oneLiner, inferred, policy, lint, check, next } = verdict;

  const needsWiden = !('boundary' in check) && !('skipped' in check) &&
    !check.shouldRun && check.failedReasons.some(r => /safeRiskClass/.test(r) && /not in allowlist/.test(r));

  const widenClass = needsWiden && inferred ? inferred.riskClass : null;

  const handleWiden = async () => {
    if (!widenClass) return;
    await api.post(`/api/units/${encodeURIComponent(name)}/widen-allowlist`, { riskClass: widenClass });
    onRefresh();
  };

  return (
    <div style={container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>verdict</span>
        <button onClick={onDismiss} style={dismissBtn}>&times;</button>
      </div>

      <Row label="unit" value={name} />
      {oneLiner && <Row label="idea" value={oneLiner} />}
      {inferred && (
        <Row label="riskClass" value={`${inferred.riskClass}  (${inferred.signal})`} />
      )}
      <Row label="policy" value={`safeRiskClass([${policy.allowlist.join(', ')}])`} />

      <div style={{ margin: '0.5rem 0' }}>
        <LintSection lint={lint} />
      </div>

      <div style={{ margin: '0.5rem 0' }}>
        <CheckSection check={check} />
      </div>

      <div style={{ margin: '0.5rem 0', fontSize: '0.8rem' }}>
        <span style={{ color: '#888' }}>next: </span>
        <span style={{ color: '#ccc' }}>{next}</span>
      </div>

      {widenClass && (
        <button onClick={handleWiden} style={fixBtn}>
          widen allowlist → {widenClass}
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>
      <span style={{ color: '#888', display: 'inline-block', width: 90 }}>{label}:</span>
      <span style={{ color: '#ccc' }}>{value}</span>
    </div>
  );
}

function LintSection({ lint }: { lint: LintField }) {
  if ('boundary' in lint) {
    return <Row label="lint" value={`boundary error — ${lint.boundary}`} />;
  }
  if (lint.ok) {
    return <Row label="lint" value="clean" />;
  }
  return (
    <div>
      <Row label="lint" value={`${lint.issues.length} issue${lint.issues.length === 1 ? '' : 's'}`} />
      {lint.issues.map((issue, i) => (
        <div key={i} style={{ fontSize: '0.75rem', color: '#d66', paddingLeft: 95 }}>
          [{issue.rule}] {issue.message}
        </div>
      ))}
    </div>
  );
}

function CheckSection({ check }: { check: CheckField }) {
  if ('boundary' in check) {
    return <Row label="check" value={`boundary error — ${check.boundary}`} />;
  }
  if ('skipped' in check) {
    return <Row label="check" value="skipped" />;
  }
  return (
    <div>
      <Row label="check" value={`shouldRun=${check.shouldRun}`} />
      {check.reasons.map((r, i) => (
        <div key={`p${i}`} style={{ fontSize: '0.75rem', color: '#6d6', paddingLeft: 95 }}>pass: {r}</div>
      ))}
      {check.failedReasons.map((r, i) => (
        <div key={`f${i}`} style={{ fontSize: '0.75rem', color: '#d66', paddingLeft: 95 }}>fail: {r}</div>
      ))}
    </div>
  );
}

const container: CSSProperties = {
  background: '#222',
  border: '1px solid #444',
  borderRadius: 6,
  padding: '1rem',
  marginTop: '1rem',
};

const dismissBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  fontSize: '1.1rem',
  cursor: 'pointer',
  padding: '0 0.3rem',
};

const fixBtn: CSSProperties = {
  marginTop: '0.5rem',
  fontSize: '0.75rem',
  padding: '0.25rem 0.6rem',
  background: '#2a3a2a',
  color: '#6d6',
  border: '1px solid #4a4',
  borderRadius: 4,
  cursor: 'pointer',
};
