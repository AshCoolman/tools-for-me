import { useEffect, useState, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { api } from '../lib/api';
import { CodePane, CodePaneHandle } from './CodePane';
import { findPredicateRanges, gateForLine } from '../lib/predicate-map';

export type WorkEditorHandle = {
  scrollToGate(gate: string): void;
};

type Props = {
  unitName: string;
  file: 'work' | 'policy' | 'executor';
  onFocusedGateChange?: (gate: string | null) => void;
};

const FILE_LABELS: Record<string, string> = {
  work: 'work.md',
  policy: 'policy.ts',
  executor: 'executor.ts',
};

const FILE_SUBTITLES: Record<string, string> = {
  work: 'what the agent should do',
  policy: 'when it’s safe to run',
  executor: 'how to run it',
};

function apiPath(unitName: string, file: string): string {
  return `/api/units/${encodeURIComponent(unitName)}/${file}`;
}

function langFor(file: string): 'markdown' | 'typescript' {
  return file === 'work' ? 'markdown' : 'typescript';
}

function wrapStorageKey(unitName: string, file: string): string {
  return `ts:wrap:${unitName}:${file}`;
}

function readWrap(unitName: string, file: string): boolean {
  try {
    const v = localStorage.getItem(wrapStorageKey(unitName, file));
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}

export const WorkEditor = forwardRef<WorkEditorHandle, Props>(function WorkEditor(
  { unitName, file, onFocusedGateChange },
  ref,
) {
  const [content, setContent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wrap, setWrap] = useState<boolean>(() => readWrap(unitName, file));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codePaneRef = useRef<CodePaneHandle>(null);

  const predicateRanges = useMemo(
    () => (file === 'policy' && content ? findPredicateRanges(content) : []),
    [file, content],
  );

  useImperativeHandle(ref, () => ({
    scrollToGate(gate: string) {
      const range = predicateRanges.find(r => r.gate === gate);
      if (range) codePaneRef.current?.scrollToLine(range.startLine);
    },
  }), [predicateRanges]);

  const handleCursorChange = useCallback((line: number) => {
    if (file !== 'policy') return;
    onFocusedGateChange?.(gateForLine(predicateRanges, line));
  }, [file, predicateRanges, onFocusedGateChange]);

  useEffect(() => {
    setContent(null);
    setEditing(false);
    setSaved(true);
    setError(null);
    setWrap(readWrap(unitName, file));
    api.get<{ text: string }>(apiPath(unitName, file))
      .then(r => setContent(r.text))
      .catch(e => setError(e instanceof Error ? e.message : 'failed to load'));
  }, [unitName, file]);

  useEffect(() => {
    try { localStorage.setItem(wrapStorageKey(unitName, file), wrap ? '1' : '0'); } catch {}
  }, [wrap, unitName, file]);

  const save = useCallback(async (text: string) => {
    try {
      await api.put(apiPath(unitName, file), { text });
      setSaved(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    }
  }, [unitName, file]);

  const handleChange = useCallback((text: string) => {
    setContent(text);
    setSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(text), 1000);
  }, [save]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const reveal = useCallback(async () => {
    try { await api.post(`/api/units/${encodeURIComponent(unitName)}/files/${file}/reveal`); } catch { /* ignore */ }
  }, [unitName, file]);

  const open = useCallback(async () => {
    try { await api.post(`/api/units/${encodeURIComponent(unitName)}/files/${file}/open`); } catch { /* ignore */ }
  }, [unitName, file]);

  const label = FILE_LABELS[file] ?? file;

  return (
    <div className="pane">
      <div className="pane-header">
        <span className={`filename${editing ? ' filename--editing' : ''}`}>{label}</span>
        <span className="pane-subtitle">{FILE_SUBTITLES[file]}</span>
        {editing && <span className="editing-chip">[editing]</span>}
        {!saved && <span className="saving-indicator">saving...</span>}
        <span className="pane-actions">
          <button
            className="pane-icon-btn"
            title="Reveal in file manager"
            onClick={reveal}
          >
            reveal
          </button>
          <button
            className="pane-icon-btn"
            title="Open in default editor"
            onClick={open}
          >
            open
          </button>
          <button
            className={`pane-icon-btn wrap-btn${wrap ? ' active' : ''}`}
            title={wrap ? 'Word wrap: on' : 'Word wrap: off'}
            onClick={() => setWrap(v => !v)}
          >
            {wrap ? 'wrap' : 'nowrap'}
          </button>
          <button
            className={`edit-btn${editing ? ' edit-btn--editing' : ''}`}
            onClick={() => setEditing(v => !v)}
          >
            {editing ? 'view' : 'edit'}
          </button>
        </span>
      </div>
      <div className="pane-body">
        {error && content === null && (
          <span className="pane-msg err">{error}</span>
        )}
        {content === null && !error && (
          <span className="pane-msg dim">loading...</span>
        )}
        {content !== null && (
          <CodePane
            ref={file === 'policy' ? codePaneRef : undefined}
            value={content}
            onChange={editing ? handleChange : undefined}
            language={langFor(file)}
            readOnly={!editing}
            wrap={wrap}
            onCursorChange={file === 'policy' ? handleCursorChange : undefined}
          />
        )}
        {error && content !== null && (
          <div className="pane-msg-sm err">{error}</div>
        )}
      </div>
    </div>
  );
});
