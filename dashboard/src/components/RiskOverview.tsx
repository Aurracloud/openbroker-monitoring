import type { LogLine, RunDetail } from '../types';
import { fmtPct, fmtRelative, fmtUsd } from '../util';

interface Props {
  run: RunDetail;
  logs: LogLine[];
}

export function RiskOverview({ run, logs }: Props) {
  const snapshot = run.latestSnapshot;
  const margin = Number(snapshot?.marginUsedPct ?? 0);
  const maxMargin = Number(run.guardrails?.policy?.maxMarginUsedPct ?? 0);
  const marginRatio = maxMargin > 0 ? Math.min(100, (margin / maxMargin) * 100) : 0;
  const riskTone = marginRatio >= 90 ? 'bad' : marginRatio >= 70 ? 'warn' : 'live';
  const policy = run.guardrails?.policy;
  const policyControls = policy
    ? Object.entries(policy).filter(([key, value]) => key !== 'mode' && value !== undefined && value !== null).length
    : 0;
  const blocks = run.guardrails?.blocks ?? run.counts?.guardrailBlocks ?? 0;
  const lastDecision = logs.find((log) => log.level !== 'debug')?.timestamp;

  return (
    <section className="risk-overview" aria-label="Account risk overview" data-testid="risk-overview">
      <div className="risk-question">
        <span className="shield-mini">◇</span>
        Is the account safe?
      </div>
      <div className="risk-grid">
        <div className="risk-primary">
          <div className={`risk-value ${riskTone}`}>{snapshot ? fmtPct(margin, 1) : '—'}</div>
          <div className="risk-label">Margin used</div>
          <div className="risk-meter" aria-label={`Margin usage ${margin.toFixed(1)}% of ${maxMargin || 0}% limit`}>
            <span className={riskTone} style={{ width: `${marginRatio}%` }} />
          </div>
          <p>{fmtUsd(snapshot?.marginUsed)} used · {fmtUsd(snapshot?.equity)} equity</p>
        </div>

        <div className="risk-cell">
          <div className="risk-cell-head">
            <span className={`shield ${policy ? 'live' : 'bad'}`}>✓</span>
            <div>
              <div className="risk-cell-title">Guardrails <strong className={policy ? 'pos' : 'neg'}>{policy ? 'ACTIVE' : 'MISSING'}</strong></div>
              <p>{policyControls} policy controls · {blocks} block{blocks === 1 ? '' : 's'} this run</p>
            </div>
          </div>
          <div className="risk-inline-stats">
            <span><small>Max margin</small><strong>{maxMargin ? fmtPct(maxMargin, 0) : '—'}</strong></span>
            <span><small>Max leverage</small><strong>{policy?.maxLeverage ? `${policy.maxLeverage.toFixed(1)}x` : '—'}</strong></span>
          </div>
        </div>

        <div className="risk-cell">
          <div className="risk-cell-head">
            <span className={`run-icon ${run.status === 'running' ? 'live' : 'bad'}`}>▶</span>
            <div>
              <div className="risk-cell-title">Automation <strong className={run.status === 'running' ? 'pos' : 'neg'}>{run.status.toUpperCase()}</strong></div>
              <p>PID {run.pid ?? '—'} · {run.useWebSocket ? 'websocket connected' : 'polling'}</p>
            </div>
          </div>
          <div className="risk-inline-stats single">
            <span><small>Last decision</small><strong>{fmtRelative(lastDecision)}</strong></span>
          </div>
        </div>
      </div>
    </section>
  );
}
