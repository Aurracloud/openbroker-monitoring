import type { RunDetail, Snapshot } from '../types';
import { fmtNum, fmtPct, fmtUsd } from '../util';

interface Props {
  run: RunDetail;
  snapshots: Snapshot[];
}

export function KpiStrip({ run, snapshots }: Props) {
  const latest = run.latestSnapshot ?? snapshots[0];
  const equity = latest?.equity;
  const marginPct = latest?.marginUsedPct;

  // first snapshot = the oldest in the list (server returns newest-first → take last)
  const first = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const equityDelta =
    first && Number.isFinite(Number(first.equity)) && Number.isFinite(Number(equity))
      ? Number(equity) - Number(first.equity)
      : null;
  const equityDeltaPct =
    first && Number(first.equity) !== 0 && equityDelta !== null
      ? (equityDelta / Number(first.equity)) * 100
      : null;

  const polls = run.pollCount ?? 0;
  const events = run.eventsEmitted ?? 0;
  const errors = run.counts?.errors ?? 0;

  const marginCls = (marginPct ?? 0) > 80 ? 'bad' : (marginPct ?? 0) > 60 ? 'warn' : 'live';

  return (
    <section className="kpi-strip">
      <Cell idx="01" label="Equity" value={fmtUsd(equity)} valueCls="live"
        foot={
          equityDelta !== null ? (
            <>
              <strong className={equityDelta >= 0 ? 'pos' : 'neg'}>
                {equityDelta >= 0 ? '+' : ''}{fmtUsd(equityDelta)}
              </strong>
              {equityDeltaPct !== null ? `  (${equityDeltaPct >= 0 ? '+' : ''}${fmtNum(equityDeltaPct, 2)}%)` : ''}
              {' since open'}
            </>
          ) : (
            'awaiting snapshot'
          )
        }
      />
      <Cell idx="02" label="Margin Used"
        value={marginPct !== undefined ? fmtPct(marginPct, 1) : '—'}
        valueCls={marginCls as 'live' | 'warn' | 'bad'}
        foot={<><strong>{fmtUsd(latest?.marginUsed)}</strong>{' notional'}</>}
      />
      <Cell idx="03" label="Polls"
        value={fmtNum(polls, 0)}
        foot={
          run.pollIntervalMs ? (
            <>
              <strong>{Math.round(run.pollIntervalMs)}ms</strong>{' interval'}
            </>
          ) : (
            'no interval set'
          )
        }
      />
      <Cell idx="04" label="Events"
        value={fmtNum(events, 0)}
        foot={
          errors > 0 ? (
            <span className="neg">
              <strong style={{ color: 'var(--red)' }}>{errors}</strong>{' error'}{errors === 1 ? '' : 's'}{' recorded'}
            </span>
          ) : (
            <>
              <strong>{run.counts?.fills ?? 0}</strong>{' fills · '}
              <strong>{run.counts?.actions ?? 0}</strong>{' actions'}
            </>
          )
        }
      />
    </section>
  );
}

function Cell({
  idx,
  label,
  value,
  foot,
  valueCls,
}: {
  idx: string;
  label: string;
  value: string;
  foot: React.ReactNode;
  valueCls?: 'live' | 'warn' | 'bad';
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        <span>{label}</span>
        <span className="idx">{idx}</span>
      </div>
      <div className={`kpi-value ${valueCls ?? ''}`}>{value}</div>
      <div className="kpi-foot">{foot}</div>
    </div>
  );
}
