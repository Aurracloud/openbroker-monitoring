import type { RunDetail } from '../types';
import { fmtDate, fmtRelative, shortAddr, shortRunId, statusColor } from '../util';

interface Props {
  run: RunDetail;
}

export function Identity({ run }: Props) {
  const color = statusColor(run.status);
  return (
    <section className="identity">
      <div>
        <div className="id-eyebrow">
          <span className={`led ${color}`} />
          <span>{run.status}</span>
          <span className="serial">·</span>
          <span className="serial">RUN-{shortRunId(run.runId).toUpperCase()}</span>
          <span className="serial">·</span>
          <span className="serial">{fmtRelative(run.startedAt)}</span>
        </div>
        <h2 className="id-title">{run.automationId}</h2>
        <div className="id-meta">
          <span>
            <span className="key">SCRIPT</span>
            <span className="val">{(run.scriptPath ?? '—').split('/').slice(-2).join('/')}</span>
          </span>
          <span>
            <span className="key">PID</span>
            <span className="val">{run.pid ?? '—'}</span>
          </span>
          <span>
            <span className="key">POLL</span>
            <span className="val">{run.pollIntervalMs ? `${run.pollIntervalMs}ms` : '—'}</span>
          </span>
          <span>
            <span className="key">ACCOUNT</span>
            <span className="val">{shortAddr(run.accountAddress)}</span>
          </span>
          <span>
            <span className="key">WALLET</span>
            <span className="val">{shortAddr(run.walletAddress)}{run.isApiWallet ? ' · api' : ''}</span>
          </span>
          <span>
            <span className="key">STARTED</span>
            <span className="val">{fmtDate(run.startedAt)}</span>
          </span>
          {run.stoppedAt ? (
            <span>
              <span className="key">STOPPED</span>
              <span className="val">{fmtDate(run.stoppedAt)}{run.stopReason ? ` · ${run.stopReason}` : ''}</span>
            </span>
          ) : null}
        </div>
      </div>
      <div className="id-tags">
        <span className={`tag ${color}`}>{run.status}</span>
        <span className={`tag ${run.dryRun ? 'dry' : 'cyan'}`}>{run.dryRun ? 'DRY RUN' : 'LIVE'}</span>
        {run.useWebSocket ? <span className="tag violet">WEBSOCKET</span> : null}
        {run.processAlive ? <span className="tag live">PID·ALIVE</span> : <span className="tag ghost">PID·DEAD</span>}
      </div>
    </section>
  );
}
