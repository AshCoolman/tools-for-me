import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';

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

function colorize(text: string, file: string): (JSX.Element | string)[] {
  const lines = text.split('\n');
  if (file === 'work') return colorizeMd(lines);
  return colorizeTs(lines);
}

function colorizeMd(lines: string[]): (JSX.Element | string)[] {
  return lines.flatMap((line, i) => {
    const el = line.startsWith('#')
      ? <span key={i} className="code-hd">{line}</span>
      : line.startsWith('-') || line.startsWith('*')
        ? <><span key={`b${i}`} className="code-dim">{line[0]}</span>{line.slice(1)}</>
        : <>{line}</>;
    return i < lines.length - 1 ? [el, '\n'] : [el];
  });
}

function colorizeTs(lines: string[]): (JSX.Element | string)[] {
  const KW = /\b(import|export|const|let|var|from|return|if|else|async|await|function|type|interface|as|new|throw|try|catch)\b/g;
  const STR = /('[^']*'|"[^"]*"|`[^`]*`)/g;

  return lines.flatMap((line, i) => {
    const parts: (JSX.Element | string)[] = [];
    let last = 0;

    type Token = { idx: number; end: number; cls: string; text: string };
    const tokens: Token[] = [];

    for (const m of line.matchAll(STR)) {
      tokens.push({ idx: m.index!, end: m.index! + m[0].length, cls: 'code-str', text: m[0] });
    }
    for (const m of line.matchAll(KW)) {
      const inStr = tokens.some(t => m.index! >= t.idx && m.index! < t.end);
      if (!inStr) {
        tokens.push({ idx: m.index!, end: m.index! + m[0].length, cls: 'code-kw', text: m[0] });
      }
    }
    tokens.sort((a, b) => a.idx - b.idx);

    for (const tok of tokens) {
      if (tok.idx > last) parts.push(line.slice(last, tok.idx));
      parts.push(<span key={`${i}-${tok.idx}`} className={tok.cls}>{tok.text}</span>);
      last = tok.end;
    }
    if (last < line.length) parts.push(line.slice(last));

    if (i < lines.length - 1) parts.push('\n');
    return parts;
  });
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
        {content !== null && !editing && (
          <pre className="code">{colorize(content, file)}</pre>
        )}
        {content !== null && editing && (
          <textarea
            value={content}
            onChange={e => handleChange(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              height: '100%',
              minHeight: 200,
              fontFamily: 'var(--mono)',
              fontSize: '11.5px',
              lineHeight: 1.6,
              padding: 0,
              background: 'transparent',
              color: 'var(--fg)',
              border: 'none',
              outline: 'none',
              resize: 'none',
            }}
          />
        )}
        {error && content !== null && (
          <div className="err" style={{ fontSize: '10px', marginTop: 4 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
