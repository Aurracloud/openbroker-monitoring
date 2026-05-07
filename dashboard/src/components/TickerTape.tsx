import { useMemo } from 'react';
import type { Automation } from '../types';
import { fmtUsd, fmtNum } from '../util';

interface Props {
  automations: Automation[];
}

export function TickerTape({ automations }: Props) {
  const items = useMemo(() => {
    const total = automations.length;
    const running = automations.filter((a) => a.status === 'running').length;
    const stale = automations.filter((a) => a.status === 'stale').length;
    const errored = automations.filter((a) => a.status === 'error').length;
    const dry = automations.filter((a) => a.dryRun).length;
    const totalEquity = automations.reduce((acc, a) => acc + Number(a.latestSnapshot?.equity ?? 0), 0);
    const totalFills = automations.reduce((acc, a) => acc + Number(a.counts?.fills ?? 0), 0);
    const totalActions = automations.reduce((acc, a) => acc + Number(a.counts?.actions ?? 0), 0);
    const totalErrors = automations.reduce((acc, a) => acc + Number(a.counts?.errors ?? 0), 0);
    const totalPolls = automations.reduce((acc, a) => acc + Number(a.pollCount ?? 0), 0);
    const totalEvents = automations.reduce((acc, a) => acc + Number(a.eventsEmitted ?? 0), 0);

    const out: { key: string; val: string; cls?: 'up' | 'down' | 'warn' }[] = [
      { key: 'AUTOMATIONS', val: String(total) },
      { key: 'LIVE', val: String(running), cls: running > 0 ? 'up' : undefined },
      { key: 'STALE', val: String(stale), cls: stale > 0 ? 'warn' : undefined },
      { key: 'ERRORED', val: String(errored), cls: errored > 0 ? 'down' : undefined },
      { key: 'DRY', val: String(dry), cls: dry > 0 ? 'warn' : undefined },
      { key: 'EQUITY Σ', val: fmtUsd(totalEquity, 0) },
      { key: 'POLLS Σ', val: fmtNum(totalPolls, 0) },
      { key: 'EVENTS Σ', val: fmtNum(totalEvents, 0) },
      { key: 'FILLS Σ', val: fmtNum(totalFills, 0) },
      { key: 'ACTIONS Σ', val: fmtNum(totalActions, 0) },
      { key: 'ERRORS Σ', val: fmtNum(totalErrors, 0), cls: totalErrors > 0 ? 'down' : undefined },
    ];

    // Per-automation pulse — surface most-recent fill counts as an extra signal
    automations
      .slice(0, 6)
      .forEach((a) => {
        const equity = Number(a.latestSnapshot?.equity ?? 0);
        out.push({
          key: a.automationId.slice(0, 18).toUpperCase(),
          val: equity ? fmtUsd(equity, 0) : a.status.toUpperCase(),
          cls: a.status === 'running' ? 'up' : a.status === 'error' ? 'down' : undefined,
        });
      });

    if (out.length === 0) {
      out.push({ key: 'STATUS', val: 'AWAITING TELEMETRY' });
    }

    return out;
  }, [automations]);

  return (
    <div className="ticker">
      <div className="ticker-label">
        <span className="led live" />
        FEED
      </div>
      <div className="ticker-track">
        <TickerStrip items={items} />
        <TickerStrip items={items} ariaHidden />
      </div>
    </div>
  );
}

function TickerStrip({
  items,
  ariaHidden,
}: {
  items: { key: string; val: string; cls?: string }[];
  ariaHidden?: boolean;
}) {
  return (
    <div className="ticker-strip" aria-hidden={ariaHidden}>
      {items.map((item, i) => (
        <span key={`${i}-${item.key}`} className="ticker-item">
          <span className="key">{item.key}</span>
          <span className={`val ${item.cls ?? ''}`}>{item.val}</span>
          <span className="delim">·</span>
        </span>
      ))}
    </div>
  );
}
