import type { ActionRow, Metric, RunDetail } from '../types';
import { classNames, fmtNum, fmtPct, fmtUsd } from '../util';

interface Props {
  run: RunDetail;
  metrics: Metric[];
  actions: ActionRow[];
}

export function GuardrailPanel({ run, metrics, actions }: Props) {
  const policy = run.guardrails?.policy;
  if (!policy) {
    return (
      <section className="panel guardrail-panel">
        <PanelHeader title="Guardrail envelope" badge="policy missing" tone="bad" />
        <div className="empty"><span className="glyph">!</span>No runtime guardrail contract was recorded for this run.</div>
      </section>
    );
  }

  const byName = new Map(metrics.map((metric) => [metric.name, Number(metric.value)]));
  const spot = byName.get('spot_usd') ?? 0;
  const short = byName.get('short_usd') ?? 0;
  const margin = Number(run.latestSnapshot?.marginUsedPct ?? 0);
  const positions = Array.isArray(run.latestSnapshot?.positions) ? run.latestSnapshot?.positions as Array<Record<string, unknown>> : [];
  const leverage = positions.reduce((max, position) => Math.max(max, Number(position.leverage ?? 0)), 0);
  const oneMinuteAgo = Date.now() - 60_000;
  const orderRate = actions.filter((action) => action.phase === 'request' && action.timestamp >= oneMinuteAgo && /order/i.test(action.method)).length;

  const rows = [
    { label: 'Max margin', current: margin, max: policy.maxMarginUsedPct, value: `${fmtPct(margin, 1)} / ${fmtPct(policy.maxMarginUsedPct, 0)}`, dangerAt: 0.9 },
    { label: 'Leverage', current: leverage, max: policy.maxLeverage, value: `${fmtNum(leverage, 1)} / ${fmtNum(policy.maxLeverage, 1)}x` },
    { label: 'Order size', current: null, max: policy.maxOrderUsd, value: fmtUsd(policy.maxOrderUsd) },
    { label: 'Position', current: Math.max(spot, short), max: policy.maxPositionUsd, value: `${fmtUsd(Math.max(spot, short))} / ${fmtUsd(policy.maxPositionUsd)}` },
    { label: 'Total exposure', current: spot + short, max: policy.maxTotalExposureUsd, value: `${fmtUsd(spot + short)} / ${fmtUsd(policy.maxTotalExposureUsd)}` },
    { label: 'Order rate', current: orderRate, max: policy.maxOrdersPerMinute, value: `${orderRate} / ${fmtNum(policy.maxOrdersPerMinute, 0)} per min` },
  ];

  return (
    <section className="panel guardrail-panel" data-testid="guardrail-envelope">
      <PanelHeader title="Guardrail envelope" badge={`${run.guardrails?.blocks ?? 0} blocks`} tone={(run.guardrails?.blocks ?? 0) > 0 ? 'warn' : 'live'} />
      <div className="guardrail-body">
        <div className="limit-list">
          {rows.map((row) => {
            const ratio = row.current === null || !row.max ? 0 : Math.min(1, Number(row.current) / Number(row.max));
            const tone = ratio >= (row.dangerAt ?? 1) ? 'bad' : ratio >= 0.7 ? 'warn' : 'live';
            return (
              <div className="limit-row" key={row.label}>
                <span className="limit-label">{row.label}</span>
                <span className="limit-track"><i className={tone} style={{ width: `${ratio * 100}%` }} /></span>
                <strong className={classNames(tone === 'bad' && 'neg', tone === 'warn' && 'warn-text')}>{row.value}</strong>
              </div>
            );
          })}
        </div>
        <div className="guardrail-meta">
          <div className="guardrail-markets">
            <span>Allowed markets</span>
            <div>{(policy.allowedMarkets ?? []).map((market) => <span className="market-chip" key={market}>{market}</span>)}</div>
          </div>
          <div className="permission-grid">
            <span className={classNames('permission', policy.allowMarketOrders ? 'allowed' : 'blocked')}>
              {policy.allowMarketOrders ? '✓' : '×'} Market orders {policy.allowMarketOrders ? 'allowed' : 'blocked'}
            </span>
            <span className={classNames('permission', policy.allowAccountWideCancel ? 'allowed' : 'blocked')}>
              {policy.allowAccountWideCancel ? '✓' : '⌑'} Account-wide cancel {policy.allowAccountWideCancel ? 'allowed' : 'blocked'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PanelHeader({ title, badge, tone }: { title: string; badge: string; tone: 'live' | 'warn' | 'bad' }) {
  return (
    <div className="panel-head">
      <div><span className="section-kicker">Risk controls</span><h2>{title}</h2></div>
      <span className={`status-badge ${tone}`}>{badge}</span>
    </div>
  );
}
