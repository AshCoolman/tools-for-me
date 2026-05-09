import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';

type SourceCandidate = {
  path: string;
  title: string;
  snippet: string;
};

type Props = {
  onSelect: (source: SourceCandidate) => void;
};

export function SourceShelf({ onSelect }: Props) {
  const [sources, setSources] = useState<SourceCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ sources: SourceCandidate[] }>('/api/sources')
      .then(data => setSources(data.sources))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#666', fontSize: '0.75rem' }}>loading sources…</div>;
  if (sources.length === 0) return null;

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.3rem' }}>discovered sources</div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {sources.map((s, i) => (
          <button key={i} onClick={() => onSelect(s)} style={sourceBtn}>
            <div style={{ fontSize: '0.8rem', color: '#ccc' }}>{s.title}</div>
            <div style={{ fontSize: '0.65rem', color: '#666' }}>{s.path}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

const sourceBtn: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '0.35rem 0.5rem',
  marginBottom: '0.2rem',
  background: '#252525',
  color: '#ccc',
  border: '1px solid #333',
  borderRadius: 4,
  cursor: 'pointer',
};
