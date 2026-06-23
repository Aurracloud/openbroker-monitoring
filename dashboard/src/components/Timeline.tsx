import { useMemo, useState } from 'react';
import type { ActionRow, AutomationCounts, ErrorRow, Fill, LogLine, Note } from '../types';
import { classNames, fmtNum, fmtTime, fmtUsd } from '../util';

type Tab = 'all' | 'decisions' | 'actions' | 'fills' | 'guardrails' | 'errors';

interface Props {
  logs: LogLine[];
  fills: Fill[];
  actions: ActionRow[];
  notes: Note[];
  errors: ErrorRow[];
  counts?: AutomationCounts;
}

interface ActivityRow {
  id: string;
  timestamp: number;
  type: 'decision' | 'action' | 'fill' | 'guardrail' | 'error' | 'log';
  message: string;
  detail?: string;
  value?: string;
}

export function Timeline({ logs, fills, actions, notes, errors, counts }: Props) {
  const [tab, setTab] = useState<Tab>('all');
  const guardrailNotes = useMemo(() => notes.filter((note) => note.kind === 'guardrail_block'), [notes]);
  const decisions = useMemo(
    () => logs.filter((log) => log.level !== 'debug' && (log.level === 'error' || /rebalance|funding|exposure|target/i.test(log.message))),
    [logs],
  );

  const rows = useMemo(() => {
    const decisionRows: ActivityRow[] = decisions.map((log) => ({
      id: `log-${log.id ?? `${log.timestamp}-${log.message}`}`,
      timestamp: log.timestamp,
      type: log.level === 'error' ? 'error' : 'decision',
      message: summarizeLog(log.message),
      detail: log.level.toUpperCase(),
    }));
    const actionRows: ActivityRow[] = actions.map((action) => ({
      id: `action-${action.id ?? action.actionId ?? action.timestamp}`,
      timestamp: action.timestamp,
      type: action.phase === 'error' ? 'error' : 'action',
      message: `${action.method} · ${action.phase}`,
      detail: action.dryRun ? 'DRY RUN' : action.actionId?.slice(0, 8),
    }));
    const fillRows: ActivityRow[] = fills.map((fill) => ({
      id: `fill-${fill.id ?? `${fill.timestamp}-${fill.oid}`}`,
      timestamp: fill.timestamp,
      type: 'fill',
      message: `${String(fill.side).toUpperCase()} ${fmtNum(fill.size, 6)} ${fill.coin}`,
      detail: fill.crossed ? 'TAKER' : 'MAKER',
      value: fmtUsd(Number(fill.size) * Number(fill.price)),
    }));
    const guardrailRows: ActivityRow[] = guardrailNotes.map((note) => ({
      id: `guardrail-${note.id ?? note.timestamp}`,
      timestamp: note.timestamp,
      type: 'guardrail',
      message: payloadMessage(note.payload, 'Runtime write blocked'),
      detail: payloadField(note.payload, 'code')?.toUpperCase(),
    }));
    const errorRows: ActivityRow[] = errors.map((error) => ({
      id: `error-${error.id ?? `${error.timestamp}-${error.stage}`}`,
      timestamp: error.timestamp,
      type: 'error',
      message: payloadMessage(error.error, error.stage),
      detail: error.stage,
    }));

    const selected = tab === 'decisions'
      ? decisionRows.filter((row) => row.type === 'decision')
      : tab === 'actions'
        ? actionRows
        : tab === 'fills'
          ? fillRows
          : tab === 'guardrails'
            ? guardrailRows
            : tab === 'errors'
              ? [...errorRows, ...decisionRows.filter((row) => row.type === 'error')]
              : [...decisionRows, ...actionRows, ...fillRows, ...guardrailRows, ...errorRows];

    const seen = new Set<string>();
    return selected
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((row) => {
        const key = `${row.timestamp}-${row.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 60);
  }, [actions, decisions, errors, fills, guardrailNotes, tab]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'decisions', label: 'Decisions' },
    { key: 'actions', label: 'Actions', count: counts?.actions ?? actions.length },
    { key: 'fills', label: 'Fills', count: counts?.fills ?? fills.length },
    { key: 'guardrails', label: 'Guardrail blocks', count: counts?.guardrailBlocks ?? guardrailNotes.length },
    { key: 'errors', label: 'Errors', count: counts?.errors ?? errors.length },
  ];

  return (
    <section className="panel activity-panel" data-testid="recent-activity">
      <div className="activity-head">
        <div><span className="section-kicker">Audit trail</span><h2>Recent activity</h2></div>
        {(counts?.errors ?? 0) > 0 ? (
          <div className="error-summary"><span>!</span>{counts?.errors} errors · inspect rate limits and runtime failures</div>
        ) : <div className="nominal-summary">✓ No runtime errors</div>}
      </div>
      <div className="tabs" role="tablist" aria-label="Activity filters">
        {tabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            className={classNames('tab', tab === item.key && 'active')}
            onClick={() => setTab(item.key)}
          >
            {item.label}{item.count !== undefined ? <span className="badge-num">{item.count}</span> : null}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="empty"><span className="glyph">∅</span>No activity in this category.</div>
      ) : (
        <div className="activity-list">
          <div className="activity-columns"><span>Time</span><span>Type</span><span>Message</span><span>Value</span><span>Details</span></div>
          {rows.map((row) => (
            <div className="activity-row" key={row.id}>
              <time>{fmtTime(row.timestamp)}</time>
              <span className={`activity-type ${row.type}`}><i />{row.type}</span>
              <span className="activity-message">{row.message}</span>
              <span className="activity-value">{row.value ?? '—'}</span>
              <span className="activity-detail">{row.detail ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function payloadField(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function payloadMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') return payload;
  return payloadField(payload, 'message') ?? payloadField(payload, 'reason') ?? fallback;
}

function summarizeLog(message: string): string {
  if (message.length <= 150) return message;
  return `${message.slice(0, 147)}…`;
}
