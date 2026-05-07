import { useState } from 'react';
import type {
  ActionRow,
  AutomationCounts,
  ErrorRow,
  Fill,
  LogLine,
  Metric,
  Note,
} from '../types';
import { classNames, fmtNum, fmtTime, fmtUsd } from '../util';

type Tab = 'logs' | 'fills' | 'actions' | 'metrics' | 'notes' | 'errors';

interface Props {
  logs: LogLine[];
  fills: Fill[];
  actions: ActionRow[];
  metrics: Metric[];
  notes: Note[];
  errors: ErrorRow[];
  counts?: AutomationCounts;
}

export function Timeline({ logs, fills, actions, metrics, notes, errors, counts }: Props) {
  const [tab, setTab] = useState<Tab>('logs');

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'logs', label: 'logs', n: counts?.logs ?? logs.length },
    { key: 'fills', label: 'fills', n: counts?.fills ?? fills.length },
    { key: 'actions', label: 'actions', n: counts?.actions ?? actions.length },
    { key: 'metrics', label: 'metrics', n: counts?.metrics ?? metrics.length },
    { key: 'notes', label: 'notes', n: counts?.notes ?? notes.length },
    { key: 'errors', label: 'errors', n: counts?.errors ?? errors.length },
  ];

  return (
    <section className="panel">
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={classNames('tab', tab === t.key && 'active')} onClick={() => setTab(t.key)}>
            <span>{t.label}</span>
            <span className="badge-num">{t.n}</span>
          </button>
        ))}
      </div>
      {tab === 'logs' && <LogsView rows={logs} />}
      {tab === 'fills' && <FillsView rows={fills} />}
      {tab === 'actions' && <ActionsView rows={actions} />}
      {tab === 'metrics' && <MetricsView rows={metrics} />}
      {tab === 'notes' && <NotesView rows={notes} />}
      {tab === 'errors' && <ErrorsView rows={errors} />}
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="empty">
      <span className="glyph">∅</span>
      {label}
    </div>
  );
}

function LogsView({ rows }: { rows: LogLine[] }) {
  if (!rows.length) return <Empty label="no logs yet" />;
  return (
    <div className="log-stream">
      {rows.map((l) => (
        <div className="log-line" key={l.id ?? `${l.timestamp}-${l.message.slice(0, 12)}`}>
          <span className="log-time">{fmtTime(l.timestamp)}</span>
          <span className={`log-level ${l.level}`}>{l.level}</span>
          <span className="log-msg">{l.message}</span>
        </div>
      ))}
    </div>
  );
}

function FillsView({ rows }: { rows: Fill[] }) {
  if (!rows.length) return <Empty label="no fills recorded" />;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Time</th>
            <th>Coin</th>
            <th>Side</th>
            <th>OID</th>
            <th className="num">Size</th>
            <th className="num">Price</th>
            <th className="num">Notional</th>
            <th className="num">Fee</th>
            <th className="num">PnL</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const notional = Number(f.size) * Number(f.price);
            const pnl = Number(f.closedPnl ?? 0);
            return (
              <tr key={f.id ?? `${f.timestamp}-${f.oid}`}>
                <td className="key">{fmtTime(f.timestamp)}</td>
                <td>{f.coin}</td>
                <td className={f.side === 'buy' ? 'pos' : 'neg'}>{(f.side ?? '').toUpperCase()}</td>
                <td className="key">{f.oid ?? '—'}</td>
                <td className="num">{fmtNum(f.size, 6)}</td>
                <td className="num">{fmtNum(f.price, 6)}</td>
                <td className="num">{fmtUsd(notional)}</td>
                <td className="num">{fmtUsd(f.fee)}</td>
                <td className={classNames('num', pnl > 0 && 'pos', pnl < 0 && 'neg')}>{fmtUsd(f.closedPnl)}</td>
                <td className="small">{f.crossed ? 'taker' : 'maker'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionsView({ rows }: { rows: ActionRow[] }) {
  if (!rows.length) return <Empty label="no audited actions" />;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Time</th>
            <th>Method</th>
            <th>Phase</th>
            <th>Mode</th>
            <th>Outcome</th>
            <th>Action ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const failed = a.phase === 'error' || (a.error && Object.keys(a.error as object).length);
            return (
              <tr key={a.id ?? a.actionId ?? a.timestamp}>
                <td className="key">{fmtTime(a.timestamp)}</td>
                <td>{a.method}</td>
                <td className={failed ? 'neg' : a.phase === 'response' ? 'pos' : ''}>{a.phase}</td>
                <td className="small">{a.dryRun ? 'DRY' : 'LIVE'}</td>
                <td className={failed ? 'neg' : ''}>
                  {failed ? 'error' : a.phase === 'response' ? 'ok' : 'sent'}
                </td>
                <td className="key small">{(a.actionId ?? '—').slice(0, 8)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricsView({ rows }: { rows: Metric[] }) {
  if (!rows.length) return <Empty label="no metrics emitted" />;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Time</th>
            <th>Name</th>
            <th className="num">Value</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id ?? `${m.timestamp}-${m.name}`}>
              <td className="key">{fmtTime(m.timestamp)}</td>
              <td>{m.name}</td>
              <td className="num">{fmtNum(m.value, 6)}</td>
              <td className="small">{Object.keys(m.tags ?? {}).length ? JSON.stringify(m.tags) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotesView({ rows }: { rows: Note[] }) {
  if (!rows.length) return <Empty label="no notes recorded" />;
  return (
    <div className="note-feed">
      {rows.map((n) => (
        <article className="note" key={n.id ?? `${n.timestamp}-${n.kind}`}>
          <div className="when">{fmtTime(n.timestamp)}</div>
          <div>
            <div className="kind">{n.kind}</div>
            <div className="body">{renderPayload(n.payload)}</div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ErrorsView({ rows }: { rows: ErrorRow[] }) {
  if (!rows.length) return <Empty label="no errors recorded · system nominal" />;
  return (
    <div className="note-feed error-feed">
      {rows.map((e) => (
        <article className="note bad" key={e.id ?? `${e.timestamp}-${e.stage}`}>
          <div className="when">{fmtTime(e.timestamp)}</div>
          <div>
            <div className="kind">{e.stage}</div>
            <div className="body">{renderPayload(e.error)}</div>
          </div>
        </article>
      ))}
    </div>
  );
}

function renderPayload(payload: unknown): React.ReactNode {
  if (payload === null || payload === undefined) return <span style={{ color: 'var(--dim)' }}>—</span>;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'number' || typeof payload === 'boolean') return String(payload);
  // shallow extract a "message" or "reason" before falling back to JSON
  const obj = payload as Record<string, unknown>;
  if (typeof obj.message === 'string') {
    return (
      <>
        <div>{obj.message}</div>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </>
    );
  }
  if (typeof obj.reason === 'string') {
    return (
      <>
        <div>{obj.reason}</div>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </>
    );
  }
  return <pre>{JSON.stringify(payload, null, 2)}</pre>;
}
