import { useState, useCallback, useEffect, type DragEvent } from 'react';
import { api } from '../lib/api';

type LintIssue = { rule: string; message: string };
type LintReport = { ok: boolean; name: string; issues: LintIssue[] };
type LintField = LintReport | { boundary: string };
type CheckDecision = { shouldRun: boolean; reasons: string[]; failedReasons: string[]; riskClass: string };
type CheckField = CheckDecision | { boundary: string } | { skipped: string };

type AddVerdict = {
  name: string;
  oneLiner: string | null;
  scaffolded: boolean;
  inferred: { riskClass: string; signal: string } | null;
  policy: { allowlist: string[] };
  lint: LintField;
  check: CheckField;
  next: string;
};

type AddResult =
  | { kind: 'verdict'; verdict: AddVerdict }
  | { kind: 'input-error'; message: string }
  | { kind: 'not-found'; name: string };

type SourceCandidate = {
  path: string;
  title: string;
  snippet: string;
};

type Props = {
  onConverted: (name: string) => void;
  onRefreshUnits: () => void;
};

export function AddTab({ onConverted, onRefreshUnits }: Props) {
  const [idea, setIdea] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<AddVerdict | null>(null);
  const [sources, setSources] = useState<SourceCandidate[]>([]);

  useEffect(() => {
    api.get<{ sources: SourceCandidate[] }>('/api/sources')
      .then(data => setSources(data.sources))
      .catch(() => {});
  }, []);

  const submit = useCallback(async (ideaText: string, fileText?: string) => {
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<AddResult>('/api/add', { idea: ideaText, fileText });
      if (result.kind === 'verdict') {
        setVerdict(result.verdict);
        onRefreshUnits();
        if (result.verdict.name) onConverted(result.verdict.name);
      } else if (result.kind === 'input-error') {
        setError(result.message);
      } else if (result.kind === 'not-found') {
        setError(`no orchestration named '${result.name}'`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setBusy(false);
    }
  }, [onConverted, onRefreshUnits]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim()) return;
    submit(idea.trim());
  };

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const text = await file.text();
      const firstLine = text.split('\n').find(l => l.trim())?.trim() ?? file.name;
      submit(firstLine.replace(/^#\s+/, ''), text);
      return;
    }
    const text = e.dataTransfer.getData('text/plain')?.trim();
    if (text) {
      const firstLine = text.split('\n')[0]?.trim() ?? text;
      submit(firstLine, text.includes('\n') ? text : undefined);
    }
  }, [submit]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain')?.trim();
    if (!text || !text.includes('\n')) return;
    e.preventDefault();
    const firstLine = text.split('\n').find(l => l.trim())?.trim() ?? '';
    submit(firstLine.replace(/^#\s+/, ''), text);
  }, [submit]);

  const handleSourceClick = (s: SourceCandidate) => {
    submit(s.title, s.snippet);
  };

  const needsWiden = verdict && !('boundary' in verdict.check) && !('skipped' in verdict.check) &&
    !(verdict.check as CheckDecision).shouldRun &&
    (verdict.check as CheckDecision).failedReasons.some(r => /safeRiskClass/.test(r) && /not in allowlist/.test(r));
  const widenClass = needsWiden && verdict?.inferred ? verdict.inferred.riskClass : null;

  const handleWiden = async () => {
    if (!widenClass || !verdict) return;
    await api.post(`/api/units/${encodeURIComponent(verdict.name)}/widen-allowlist`, { riskClass: widenClass });
    submit(verdict.name);
  };

  return (
    <div className="add-content">
      <h3>Add new work</h3>

      <form onSubmit={handleSubmit}>
        <input
          className="add-input-lg"
          type="text"
          value={idea}
          onChange={e => setIdea(e.target.value)}
          onPaste={handlePaste}
          placeholder="type an idea or paste multi-line text..."
          disabled={busy}
        />
        <button className="add-submit-lg" type="submit" disabled={busy || !idea.trim()}>
          {busy ? 'adding...' : 'add'}
        </button>
      </form>

      <div
        className="add-drop"
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          borderColor: dragging ? 'var(--ok)' : undefined,
          background: dragging ? 'rgba(115,201,145,0.05)' : undefined,
        }}
      >
        drop a file here or paste multi-line text above
      </div>

      {error && <div className="err" style={{ fontSize: '11px', marginTop: 8 }}>{error}</div>}

      {sources.length > 0 && (
        <div className="add-sources">
          <div className="add-sources-label">import from</div>
          {sources.map((s, i) => (
            <span key={i} className="source-chip" onClick={() => handleSourceClick(s)} title={s.path}>
              {s.title}
            </span>
          ))}
        </div>
      )}

      {verdict && (
        <div style={{ marginTop: 16, fontSize: '11px' }}>
          <div style={{ marginBottom: 4 }}>
            <span className="dim">name: </span>{verdict.name}
          </div>
          {verdict.inferred && (
            <div style={{ marginBottom: 4 }}>
              <span className="dim">risk: </span>
              <span>{verdict.inferred.riskClass}</span>
              <span className="dim"> ({verdict.inferred.signal})</span>
            </div>
          )}
          <div style={{ marginBottom: 4 }}>
            <span className="dim">policy: </span>
            safeRiskClass([{verdict.policy.allowlist.join(', ')}])
          </div>
          <div style={{ marginBottom: 4 }}>
            <span className="dim">lint: </span>
            {'boundary' in verdict.lint
              ? <span className="err">boundary error</span>
              : verdict.lint.ok
                ? <span className="ok">clean</span>
                : <span className="warn">{verdict.lint.issues.length} issue{verdict.lint.issues.length !== 1 ? 's' : ''}</span>
            }
          </div>
          {'boundary' in verdict.lint || ('ok' in verdict.lint && !verdict.lint.ok && verdict.lint.issues.map((issue, i) => (
            <div key={i} className="err" style={{ paddingLeft: 48 }}>[{issue.rule}] {issue.message}</div>
          )))}
          <div style={{ marginBottom: 4 }}>
            <span className="dim">check: </span>
            {'boundary' in verdict.check
              ? <span className="err">boundary error</span>
              : 'skipped' in verdict.check
                ? <span className="dim">skipped</span>
                : verdict.check.shouldRun
                  ? <span className="ok">pass</span>
                  : <span className="err">blocked</span>
            }
          </div>
          <div style={{ marginBottom: 4 }}>
            <span className="dim">next: </span>{verdict.next}
          </div>
          {widenClass && (
            <button
              onClick={handleWiden}
              style={{
                marginTop: 4, fontSize: '10px', padding: '2px 8px',
                background: 'var(--bg-3)', color: 'var(--ok)',
                border: '1px solid var(--ok)', borderRadius: 3, cursor: 'pointer',
              }}
            >
              allow {widenClass}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type { AddVerdict };
