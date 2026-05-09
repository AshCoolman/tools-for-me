import { api } from '../lib/api';

type UnitItem = {
  name: string;
  riskClass: string;
  latestStatus: string | null;
};

type Props = {
  items: UnitItem[];
  onRefresh: () => void;
};

export function UnitBoard({ items, onRefresh }: Props) {
  if (items.length === 0) {
    return <p style={{ color: '#666' }}>No orchestration units found.</p>;
  }

  const action = async (name: string, verb: string) => {
    try {
      await api.post(`/api/units/${encodeURIComponent(name)}/${verb}`);
    } catch (e) {
      console.error(`${verb} ${name}:`, e);
    }
    onRefresh();
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #444', color: '#888', textAlign: 'left' }}>
          <th style={thStyle}>unit</th>
          <th style={thStyle}>risk</th>
          <th style={thStyle}>status</th>
          <th style={thStyle}>actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.name} style={{ borderBottom: '1px solid #333' }}>
            <td style={tdStyle}>{item.name}</td>
            <td style={tdStyle}>
              <span style={riskBadge(item.riskClass)}>{item.riskClass}</span>
            </td>
            <td style={tdStyle}>
              <span style={statusBadge(item.latestStatus)}>{item.latestStatus ?? '-'}</span>
            </td>
            <td style={tdStyle}>
              <button onClick={() => action(item.name, 'run')} style={actionBtn} title="run once">run</button>
              <button onClick={() => action(item.name, 'unlock')} style={actionBtn} title="unlock">unlock</button>
              <button onClick={() => action(item.name, 'clear-suppression')} style={actionBtn} title="clear suppression">unsuppress</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const thStyle: React.CSSProperties = { padding: '0.4rem 0.6rem', fontWeight: 500, fontSize: '0.75rem' };
const tdStyle: React.CSSProperties = { padding: '0.4rem 0.6rem' };

const actionBtn: React.CSSProperties = {
  fontSize: '0.7rem',
  padding: '0.1rem 0.4rem',
  marginRight: '0.3rem',
  background: '#333',
  color: '#ccc',
  border: '1px solid #555',
  borderRadius: 3,
  cursor: 'pointer',
};

function riskBadge(riskClass: string): React.CSSProperties {
  const bg = riskClass === 'readonly' ? '#2a3a2a' : riskClass === 'repo-local' ? '#3a3a2a' : '#3a2a2a';
  const color = riskClass === 'readonly' ? '#6d6' : riskClass === 'repo-local' ? '#dd6' : '#d66';
  return { fontSize: '0.7rem', padding: '0.1rem 0.3rem', borderRadius: 3, background: bg, color };
}

function statusBadge(status: string | null): React.CSSProperties {
  if (!status) return { color: '#666' };
  const color = status === 'completed' ? '#6d6' : status === 'failed' ? '#d66' : '#dd6';
  return { color };
}
