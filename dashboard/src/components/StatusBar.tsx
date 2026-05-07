import { useEffect, useState } from 'react';
import type { Health } from '../types';
import { bytes, fmtTime } from '../util';

interface Props {
  health: Health | null;
  lastUpdated: number | null;
  error: string | null;
}

export function StatusBar({ health, lastUpdated, error }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="statusbar">
      <span className="statusbar-cell">
        <span className="statusbar-key">SYS</span>
        <span className="statusbar-val">OPENBROKER · MISSION CONTROL · v0.3</span>
      </span>
      <span className="statusbar-cell">
        <span className="statusbar-key">UTC</span>
        <span className="statusbar-val">
          {new Date(now).toISOString().replace('T', ' ').slice(0, 19)}
        </span>
      </span>
      <span className="statusbar-cell">
        <span className="statusbar-key">DB</span>
        <span className="statusbar-val">
          {health?.dbExists ? bytes(health.dbSizeBytes) : 'ABSENT'}
        </span>
      </span>
      <span className="statusbar-cell">
        <span className="statusbar-key">SYNC</span>
        <span className="statusbar-val">{lastUpdated ? fmtTime(lastUpdated) : '—'}</span>
      </span>
      {error ? (
        <span className="statusbar-cell error grow">
          <span className="led bad" />
          <span>{error}</span>
        </span>
      ) : (
        <span className="statusbar-cell grow">
          <span className="led live" />
          <span className="statusbar-val">FEED OK</span>
        </span>
      )}
    </div>
  );
}
