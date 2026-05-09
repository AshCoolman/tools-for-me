import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';

type SuppressionRecord = {
  key: string;
  reason: string;
  createdAt: string;
  expiresAt?: string;
};

export function SuppressionsPanel() {
  const [records, setRecords] = useState<SuppressionRecord[]>([]);

  const refresh = () => {
    api.get<SuppressionRecord[]>('/api/suppressions')
      .then(setRecords)
      .catch(() => {});
  };

  useEffect(() => { refresh(); }, []);

  const clear = async (key: string) => {
    await api.post(`/api/units/${encodeURIComponent(key)}/clear-suppression`, { key });
    refresh();
  };

  if (records.length === 0) return null;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.3rem' }}>suppressions</div>
      {records.map(r => (
        <div key={r.key} style={row}>
          <span style={{ color: '#dd6', fontSize: '0.8rem' }}>{r.key}</span>
          <span style={{ color: '#666', fontSize: '0.7rem', flex: 1 }}>{r.reason}</span>
          <button onClick={() => clear(r.key)} style={clearBtn}>clear</button>
        </div>
      ))}
    </div>
  );
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.25rem 0',
  borderBottom: '1px solid #2a2a2a',
};

const clearBtn: CSSProperties = {
  fontSize: '0.65rem',
  padding: '0.1rem 0.4rem',
  background: '#333',
  color: '#ccc',
  border: '1px solid #555',
  borderRadius: 3,
  cursor: 'pointer',
};
