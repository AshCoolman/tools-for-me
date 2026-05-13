import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { CodePane } from './CodePane';

type Props = {
  unitName: string;
  file: 'work' | 'policy' | 'executor';
};

const FILE_LABELS: Record<string, string> = {
  work: 'work.md',
  policy: 'policy.ts',
  executor: 'executor.ts',
};

function apiPath(unitName: string, file: string): string {
  return `/api/units/${encodeURIComponent(unitName)}/${file}`;
}

function langFor(file: string): 'markdown' | 'typescript' {
  return file === 'work' ? 'markdown' : 'typescript';
}

export function WorkEditor({ unitName, file }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setContent(null);
    setEditing(false);
    setSaved(true);
    setError(null);
    api.get<{ text: string }>(apiPath(unitName, file))
      .then(r => setContent(r.text))
      .catch(e => setError(e instanceof Error ? e.message : 'failed to load'));
  }, [unitName, file]);

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

  const label = FILE_LABELS[file] ?? file;

  return (
    <div className="pane">
      <div className="pane-header">
        <span className="filename">{label}</span>
        {!saved && <span style={{ fontSize: '9px', color: 'var(--warn)' }}>saving...</span>}
        <button
          className="edit-btn"
          onClick={() => setEditing(v => !v)}
        >
          {editing ? 'view' : 'edit'}
        </button>
      </div>
      <div className="pane-body">
        {error && content === null && (
          <span className="err" style={{ fontSize: '11px' }}>{error}</span>
        )}
        {content === null && !error && (
          <span className="dim" style={{ fontSize: '11px' }}>loading...</span>
        )}
        {content !== null && (
          <CodePane
            value={content}
            onChange={editing ? handleChange : undefined}
            language={langFor(file)}
            readOnly={!editing}
          />
        )}
        {error && content !== null && (
          <div className="err" style={{ fontSize: '10px', marginTop: 4 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
