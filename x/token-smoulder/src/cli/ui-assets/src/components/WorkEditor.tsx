import { useEffect, useState, useRef, useCallback, type CSSProperties } from 'react';
import { api } from '../lib/api';

type Props = {
  unitName: string;
};

export function WorkEditor({ unitName }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setContent(null);
    setSaved(true);
    setError(null);
    api.get<{ text: string }>(`/api/units/${encodeURIComponent(unitName)}/work`)
      .then(r => setContent(r.text))
      .catch(e => setError(e instanceof Error ? e.message : 'failed to load'));
  }, [unitName]);

  const save = useCallback(async (text: string) => {
    try {
      await api.put(`/api/units/${encodeURIComponent(unitName)}/work`, { text });
      setSaved(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    }
  }, [unitName]);

  const handleChange = useCallback((text: string) => {
    setContent(text);
    setSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(text), 1000);
  }, [save]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  if (error && content === null) {
    return <div style={{ color: '#d66', fontSize: '0.75rem' }}>{error}</div>;
  }
  if (content === null) {
    return <div style={{ color: '#666', fontSize: '0.75rem' }}>loading…</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#888' }}>work.md</span>
        <span style={{ fontSize: '0.7rem', color: saved ? '#6d6' : '#dd6' }}>
          {saved ? 'saved' : 'saving…'}
        </span>
      </div>
      <textarea
        value={content}
        onChange={e => handleChange(e.target.value)}
        style={textareaStyle}
        spellCheck={false}
      />
      {error && <div style={{ color: '#d66', fontSize: '0.7rem', marginTop: '0.2rem' }}>{error}</div>}
    </div>
  );
}

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 200,
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  padding: '0.5rem',
  background: '#1a1a1a',
  color: '#ccc',
  border: '1px solid #444',
  borderRadius: 4,
  resize: 'vertical',
  boxSizing: 'border-box',
};
