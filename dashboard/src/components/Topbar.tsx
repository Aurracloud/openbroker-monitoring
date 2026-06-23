import type { Health, RunDetail } from '../types';
import { bytes, fmtRelative, shortAddr } from '../util';

interface Props {
  onRefresh: () => void;
  refreshing: boolean;
  run: RunDetail | null;
  health: Health | null;
  lastUpdated: number | null;
  error: string | null;
}

export function Topbar({ onRefresh, refreshing, run, health, lastUpdated, error }: Props) {
  return (
    <header className="workspace-topbar">
      <div className="breadcrumb">
        <span>Automations</span><i>/</i><strong>{run?.automationId ?? 'Select a run'}</strong>
      </div>
      <div className="topbar-actions">
        {run?.isApiWallet ? <span className="wallet-badge">API WALLET · {shortAddr(run.walletAddress)}</span> : null}
        <span className="network-badge"><i />Mainnet</span>
        <button className="refresh-button" onClick={onRefresh} disabled={refreshing}>
          <span className={refreshing ? 'spin' : ''}>↻</span>{refreshing ? 'Syncing' : 'Refresh'}
        </button>
        <span className={`feed-state ${error ? 'bad' : ''}`}><i />{error ? 'Feed offline' : `Feed live · ${fmtRelative(lastUpdated)}`}</span>
      </div>
      <div className="run-meta-row">
        <span>{run?.scriptPath?.split('/').slice(-2).join('/') ?? 'Awaiting run telemetry'}</span>
        {run ? <><span>PID {run.pid ?? '—'}</span><span>{run.pollIntervalMs ? `${run.pollIntervalMs}ms poll` : 'event driven'}</span></> : null}
        <span className="db-meta">Audit DB {health?.dbExists ? bytes(health.dbSizeBytes) : 'unavailable'}</span>
      </div>
    </header>
  );
}
