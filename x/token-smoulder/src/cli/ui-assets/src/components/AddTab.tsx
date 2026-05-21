import { useState, useCallback, useEffect, type DragEvent } from 'react';
import { api } from '../lib/api';
import { friendlyBlockingReason } from '../lib/help';

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
  onRunUnit?: (name: string) => void;
  unitsEmpty?: boolean;
  daemonRunning?: boolean;
};

export function GhostWorkUnitCTA({ onClick }: { onClick: () => void }) {
  return (
    <div className="ghost-cta-wrap">
      <button className="ghost-cta-card" onClick={onClick}>
        <span className="ghost-cta-title">No work units yet</span>
        <span className="ghost-cta-sub">add your first</span>
      </button>
    </div>
  );
}

export function AddTab({ onConverted, onRefreshUnits, onRunUnit, unitsEmpty = false, daemonRunning = true }: Props) {
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

  const lintOk = verdict && !('boundary' in verdict.lint) && verdict.lint.ok;
  const lintIssues = verdict && !('boundary' in verdict.lint) && 'ok' in verdict.lint && !verdict.lint.ok ? verdict.lint.issues : [];
  const lintError = verdict && 'boundary' in verdict.lint;

  const checkReady = verdict && !('boundary' in verdict.check) && !('skipped' in verdict.check) && (verdict.check as CheckDecision).shouldRun;
  const checkBlocked = verdict && !('boundary' in verdict.check) && !('skipped' in verdict.check) && !(verdict.check as CheckDecision).shouldRun;
  const checkError = verdict && 'boundary' in verdict.check;
  const checkSkipped = verdict && 'skipped' in verdict.check;

  return (
    <div className="add-content">
      {unitsEmpty && (
        <div className="ghost-cta-banner">
          <span className="ghost-cta-banner-dot">●</span>
          <span>No work units yet — start by adding one below.</span>
        </div>
      )}
      <h3>Add a task</h3>
      <p>Describe what you want an AI agent to do. The system creates three files:
        <strong> work.md</strong> (what to do),
        <strong> policy.ts</strong> (when to run),
        <strong> executor.ts</strong> (how to run it).</p>

      <form className="add-form" onSubmit={handleSubmit}>
        <input
          className="add-input-lg"
          type="text"
          value={idea}
          onChange={e => setIdea(e.target.value)}
          onPaste={handlePaste}
          placeholder="e.g. generate a /deploy slash command"
          disabled={busy}
          autoFocus
        />
        <button className="add-submit-lg" type="submit" disabled={busy || !idea.trim()}>
          {busy ? 'adding...' : 'Add'}
        </button>
      </form>

      {error && <div className="add-error err">{error}</div>}

      <div
        className={`add-drop${dragging ? ' add-drop--active' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        or drop a file here
      </div>

      {sources.length > 0 && (
        <div className="add-sources">
          <div className="add-sources-label">Suggestions from your project</div>
          {sources.map((s, i) => (
            <span key={i} className="source-chip" onClick={() => handleSourceClick(s)} title={s.path}>
              {s.title}
            </span>
          ))}
        </div>
      )}

      {verdict && (
        <div className="verdict-card">
          <div className="verdict-header">
            <span className={verdict.scaffolded ? 'ok' : ''}>{verdict.scaffolded ? 'Created' : 'Verified'}</span>
            <span className="verdict-name">{verdict.name}</span>
          </div>

          <div className="verdict-grid">
            {verdict.inferred && (
              <div className="verdict-row">
                <span className="verdict-label">safety</span>
                <span>{verdict.inferred.riskClass} <span className="dim">({verdict.inferred.signal})</span></span>
              </div>
            )}
            <div className="verdict-row">
              <span className="verdict-label">allowed</span>
              <span>{verdict.policy.allowlist.join(', ') || <span className="dim">none</span>}</span>
            </div>
            <div className="verdict-row">
              <span className="verdict-label">lint</span>
              <span>
                {lintError && <span className="err">error</span>}
                {lintOk && <span className="ok">clean</span>}
                {lintIssues.length > 0 && <span className="warn">{lintIssues.length} issue{lintIssues.length !== 1 ? 's' : ''}</span>}
              </span>
            </div>
            {lintIssues.map((issue, i) => (
              <div key={i} className="verdict-row">
                <span className="verdict-label" />
                <span className="err">[{issue.rule}] {issue.message}</span>
              </div>
            ))}
            <div className="verdict-row">
              <span className="verdict-label">dispatch</span>
              <span>
                {checkReady && daemonRunning && <span className="ok">ready — conditions met</span>}
                {checkReady && !daemonRunning && <span className="warn">conditions met but queue is paused</span>}
                {checkBlocked && (() => {
                  const reasons = (verdict.check as CheckDecision).failedReasons;
                  const first = reasons[0] ? friendlyBlockingReason(reasons[0]) : 'safety check failed';
                  return <span className="err">blocked — {first}{reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ''}</span>;
                })()}
                {checkError && <span className="err">error checking conditions</span>}
                {checkSkipped && <span className="dim">not checked yet</span>}
              </span>
            </div>
            {!daemonRunning && (
              <div className="verdict-row">
                <span className="verdict-label" />
                <span className="warn verdict-daemon-warn">Queue paused — resume for automatic dispatch</span>
              </div>
            )}
          </div>

          {verdict.scaffolded && (
            <div className="verdict-defaults">
              Default policy: runs when quota is available and keyboard is idle. Edit policy.ts to change.
            </div>
          )}

          <div className="verdict-actions">
            {checkReady && onRunUnit && (
              <button className="add-submit-lg" onClick={() => onRunUnit(verdict.name)}>
                Run now
              </button>
            )}
            <button className="verdict-open-btn" onClick={() => onConverted(verdict.name)}>
              Open in editor
            </button>
          </div>

          {widenClass && (
            <button className="add-submit-lg verdict-action" onClick={handleWiden}>
              Allow safety level: {widenClass}
            </button>
          )}

          {verdict.next && (
            <div className="verdict-next">
              <span className="verdict-label">next step:</span> {verdict.next}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { AddVerdict };
