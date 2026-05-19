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
    <>
      <div className="daemon-row">
        <span className={`daemon-dot ${running ? 'running' : 'stopped'}`} />
        <span>daemon</span>
        <span className={`daemon-pill ${running ? 'running' : 'stopped'}`}>
          {running ? 'running' : 'stopped'}
        </span>
        <span style={{ flex: 1 }} />
        {running ? (
          <button className="daemon-btn" onClick={stop}>stop</button>
        ) : (
          <button className="daemon-btn" onClick={start}>start</button>
        )}
      </div>
      <div className="daemon-row" style={{ marginTop: 4 }}>
        <span>tick</span>
        <input
          className="tick-input"
          type="number"
          value={tick}
          onChange={e => setTick(e.target.value)}
          readOnly={running}
          aria-label="tick interval in milliseconds"
        />
        <span className="dim">ms</span>
      </div>
    </>
  );
}
