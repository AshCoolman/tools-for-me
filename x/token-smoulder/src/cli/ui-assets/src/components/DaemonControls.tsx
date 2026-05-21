import { useState } from 'react';
import { api } from '../lib/api';

type Props = {
  running: boolean;
  onRefresh: () => void;
};

function msToFriendly(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.round(ms / 60_000);
  return `${mins}m`;
}

function friendlyToMs(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  const mMatch = trimmed.match(/^(\d+)\s*m$/);
  if (mMatch) return Number(mMatch[1]) * 60_000;
  const sMatch = trimmed.match(/^(\d+)\s*s$/);
  if (sMatch) return Number(sMatch[1]) * 1000;
  const num = Number(trimmed);
  if (Number.isFinite(num) && num > 0) return num > 300 ? num : num * 1000;
  return null;
}

export function DaemonControls({ running, onRefresh }: Props) {
  const [tickInput, setTickInput] = useState('30s');

  const start = async () => {
    const tickMs = friendlyToMs(tickInput);
    await api.post('/api/daemon/start', {
      tick: tickMs && tickMs >= 5000 ? tickMs : undefined,
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
        <span className={`daemon-dot ${running ? 'running' : 'paused'}`} />
        <span>queue</span>
        <span className={`daemon-pill ${running ? 'running' : 'paused'}`}>
          {running ? 'running' : 'paused'}
        </span>
        <span className="spacer" />
        {running ? (
          <button className="daemon-btn" onClick={stop}>pause</button>
        ) : (
          <button className="daemon-btn" onClick={start}>resume</button>
        )}
      </div>
      {!running && (
        <div className="daemon-row daemon-tick-row">
          <span>check every</span>
          <input
            className="tick-input"
            type="text"
            value={tickInput}
            onChange={e => setTickInput(e.target.value)}
            placeholder="30s"
            aria-label="polling interval (e.g. 30s, 5m)"
          />
        </div>
      )}
    </>
  );
}

export { msToFriendly };
