import { useState } from 'react';
import { api } from '../lib/api';

type Props = {
  running: boolean;
  onRefresh: () => void;
};

export function DaemonControls({ running, onRefresh }: Props) {
  const [tick, setTick] = useState('30000');

  const start = async () => {
    const tickMs = Number(tick);
    await api.post('/api/daemon/start', {
      tick: Number.isFinite(tickMs) && tickMs > 0 ? tickMs : undefined,
    });
    onRefresh();
  };

  const stop = async () => {
    await api.post('/api/daemon/stop');
    onRefresh();
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.75rem', color: '#aaa' }}>daemon</span>
      <span style={{
        fontSize: '0.7rem',
        padding: '0.1rem 0.4rem',
        borderRadius: 3,
        background: running ? '#2a4a2a' : '#333',
        color: running ? '#6d6' : '#888',
      }}>
        {running ? 'running' : 'stopped'}
      </span>
      {running ? (
        <button onClick={stop} style={btnStyle}> stop</button>
      ) : (
        <>
          <input
            type="number"
            value={tick}
            onChange={e => setTick(e.target.value)}
            aria-label="tick interval in milliseconds"
            style={{ width: 60, fontSize: '0.75rem', padding: '0.15rem 0.3rem', background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: 3 }}
          />
          <span style={{ fontSize: '0.65rem', color: '#666' }}>ms</span>
          <button onClick={start} style={btnStyle}>start</button>
        </>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  padding: '0.15rem 0.5rem',
  background: '#333',
  color: '#ccc',
  border: '1px solid #555',
  borderRadius: 3,
  cursor: 'pointer',
};
