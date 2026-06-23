import type { Metric, RunDetail, Snapshot } from '../types';
import { classNames, fmtPct, fmtUsd } from '../util';

interface Props {
  run: RunDetail;
  snapshots: Snapshot[];
  metrics: Metric[];
}

export function PerformanceStrip({ run, snapshots, metrics }: Props) {
  const latest = run.latestSnapshot ?? snapshots[0];
  const first = snapshots.length ? snapshots[snapshots.length - 1] : null;
  const equityDelta = latest && first ? Number(latest.equity) - Number(first.equity) : null;
  const byName = new Map(metrics.map((metric) => [metric.name, Number(metric.value)]));
  const spot = byName.get('spot_usd');
  const short = byName.get('short_usd');
  const delta = spot !== undefined && short !== undefined ? spot - short : null;
  const funding = byName.get('funding_annualized_pct');
  const target = byName.get('target_carry_usd');

  return (
    <section className="performance-strip" aria-label="Key performance metrics">
      <MetricCell
        value={fmtUsd(latest?.equity)}
        label="Account equity"
        foot={equityDelta === null ? 'awaiting history' : `${equityDelta >= 0 ? '+' : ''}${fmtUsd(equityDelta)} over window`}
        tone={equityDelta !== null && equityDelta < 0 ? 'bad' : 'live'}
      />
      <MetricCell
        value={delta === null ? '—' : `${delta >= 0 ? '+' : ''}${fmtUsd(delta)}`}
        label="Net exposure delta"
        foot={spot === undefined || short === undefined ? 'awaiting exposure metrics' : `Spot ${fmtUsd(spot)} / Short ${fmtUsd(short)}`}
        tone={delta !== null && Math.abs(delta) <= 20 ? 'live' : 'warn'}
      />
      <MetricCell
        value={funding === undefined ? '—' : fmtPct(funding, 2)}
        label="Funding APR"
        foot="latest annualized rate"
      />
      <MetricCell
        value={fmtUsd(target)}
        label="Target allocation"
        foot="current strategy target"
      />
    </section>
  );
}

function MetricCell({ value, label, foot, tone }: { value: string; label: string; foot: string; tone?: 'live' | 'warn' | 'bad' }) {
  return (
    <div className="performance-cell">
      <div className={classNames('performance-value', tone)}>{value}</div>
      <div className="performance-label">{label}</div>
      <div className={classNames('performance-foot', tone === 'bad' && 'neg')}>{foot}</div>
    </div>
  );
}
