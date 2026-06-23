import { useMemo, useState } from 'react';
import type { Automation } from '../types';
import { classNames, fmtRelative, fmtUsd, statusColor } from '../util';
import { Sparkline } from './Sparkline';

interface Props {
  automations: Automation[];
  selectedRunId: string | null;
  onSelect: (a: Automation) => void;
  sparkSeries: Record<string, number[]>;
}

const FILTERS: { key: string; label: string; match: (a: Automation) => boolean }[] = [
  { key: 'all', label: 'all', match: () => true },
  { key: 'live', label: 'live', match: (a) => a.status === 'running' },
  { key: 'stale', label: 'stale', match: (a) => a.status === 'stale' || a.status === 'unknown' },
  { key: 'err', label: 'err', match: (a) => a.status === 'error' || (a.counts?.errors ?? 0) > 0 },
  { key: 'dry', label: 'dry', match: (a) => !!a.dryRun },
];

export function AutomationRail({ automations, selectedRunId, onSelect, sparkSeries }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matcher = FILTERS.find((f) => f.key === filter)!.match;
    return automations.filter((a) => {
      if (!matcher(a)) return false;
      if (!q) return true;
      const haystack = [a.automationId, a.scriptPath ?? '', a.runId, a.accountAddress ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [automations, query, filter]);

  return (
    <div className="rail">
      <div className="rail-head">
        <div>
          <span className="rail-kicker">Runtime oversight</span>
          <h1>Automation monitor</h1>
        </div>
        <span className="count">{filtered.length}/{automations.length}</span>
      </div>
      <div className="rail-search">
        <input
          className="search-input"
          placeholder="Search automations"
          aria-label="Search automations"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filter-pills">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={classNames('pill', filter === f.key && 'active')}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rail-list">
        {filtered.length === 0 ? (
          <div className="empty">
            <span className="glyph">∅</span>
            no matches
          </div>
        ) : (
          filtered.map((a) => (
            <AutomationCard
              key={a.runId}
              automation={a}
              active={a.runId === selectedRunId}
              onSelect={() => onSelect(a)}
              spark={sparkSeries[a.runId] ?? []}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface CardProps {
  automation: Automation;
  active: boolean;
  onSelect: () => void;
  spark: number[];
}

function AutomationCard({ automation, active, onSelect, spark }: CardProps) {
  const color = statusColor(automation.status);
  const last = automation.latestSnapshot?.timestamp ?? automation.startedAt ?? null;
  const equity = automation.latestSnapshot?.equity;
  const scriptShort = (automation.scriptPath ?? '')
    .split('/')
    .slice(-2)
    .join('/');

  return (
    <button
      className={classNames('auto-card', active && 'active')}
      onClick={onSelect}
      data-status={automation.status}
    >
      <div className="auto-copy">
        <div className="auto-title">
          <span className={`led ${color}`} />
          {automation.automationId}
        </div>
        <div className="auto-meta">
          <span className={`tag ${color}`}>{automation.status === 'running' ? 'LIVE' : automation.status}</span>
          {automation.dryRun ? <span className="tag dry">DRY RUN</span> : null}
        </div>
        <div className="auto-script" title={automation.scriptPath}>
          {scriptShort || automation.runId}
        </div>
      </div>
      <div className="auto-spark">
        {spark.length >= 2 ? <Sparkline values={spark} ariaLabel="equity sparkline" /> : null}
        <div className="auto-equity">
          <span>Equity</span><strong>{equity !== undefined ? fmtUsd(equity, 2) : '—'}</strong>
        </div>
      </div>
      <div />
      <div className="auto-time"><span>Last tick</span>{fmtRelative(last)}</div>
    </button>
  );
}
