import { useEffect, useState } from 'react';

interface Props {
  onRefresh: () => void;
  refreshing: boolean;
}

export function Topbar({ onRefresh, refreshing }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const d = new Date(now);
  const time = d.toLocaleTimeString([], { hour12: false });
  const date = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: '2-digit' }).toUpperCase();

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <span>O</span>
        </div>
        <div className="brand-text">
          <h1>
            mission <em>control</em>
          </h1>
          <p className="brand-sub">openbroker · automation telemetry</p>
        </div>
      </div>
      <div className="topbar-mid">
        <div className="timestamp-block">
          <div className="clock">{time}</div>
          <div className="date">{date}</div>
        </div>
      </div>
      <div className="topbar-actions">
        <button className="btn ghost" onClick={onRefresh} disabled={refreshing}>
          <span className={`led ${refreshing ? 'live' : 'warn'}`} />
          {refreshing ? 'syncing' : 'refresh'}
        </button>
      </div>
    </header>
  );
}
