import { useState, useCallback, type DragEvent, type CSSProperties } from 'react';
import { api } from '../lib/api';
import type { AddVerdict } from './Verdict';

type AddResult =
  | { kind: 'verdict'; verdict: AddVerdict }
  | { kind: 'input-error'; message: string }
  | { kind: 'not-found'; name: string };

type Props = {
  onVerdict: (verdict: AddVerdict) => void;
};

export function AddDropZone({ onVerdict }: Props) {
  const [idea, setIdea] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async (ideaText: string, fileText?: string) => {
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<AddResult>('/api/add', {
        idea: ideaText,
        fileText,
      });
      if (result.kind === 'verdict') {
        onVerdict(result.verdict);
        setIdea('');
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
  }, [onVerdict]);

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
      const ideaText = firstLine.replace(/^#\s+/, '');
      submit(ideaText, text);
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
    const ideaText = firstLine.replace(/^#\s+/, '');
    submit(ideaText, text);
  }, [submit]);

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input
          type="text"
          value={idea}
          onChange={e => setIdea(e.target.value)}
          onPaste={handlePaste}
          placeholder="type an idea or paste multi-line text…"
          disabled={busy}
          style={inputStyle}
        />
        <button type="submit" disabled={busy || !idea.trim()} style={submitBtn}>
          {busy ? '…' : 'add'}
        </button>
      </form>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          ...dropZone,
          borderColor: dragging ? '#6d6' : '#444',
          background: dragging ? '#1a2a1a' : '#222',
        }}
      >
        <span style={{ color: '#666', fontSize: '0.8rem' }}>
          drop a file here or paste multi-line text above
        </span>
      </div>
      {error && <div style={{ color: '#d66', fontSize: '0.75rem', marginTop: '0.3rem' }}>{error}</div>}
    </div>
  );
}

const inputStyle: CSSProperties = {
  flex: 1,
  fontSize: '0.8rem',
  padding: '0.3rem 0.5rem',
  background: '#222',
  color: '#ccc',
  border: '1px solid #444',
  borderRadius: 4,
};

const submitBtn: CSSProperties = {
  fontSize: '0.75rem',
  padding: '0.3rem 0.8rem',
  background: '#333',
  color: '#ccc',
  border: '1px solid #555',
  borderRadius: 4,
  cursor: 'pointer',
};

const dropZone: CSSProperties = {
  border: '2px dashed #444',
  borderRadius: 6,
  padding: '1.5rem',
  textAlign: 'center',
  transition: 'border-color 0.15s, background 0.15s',
};
