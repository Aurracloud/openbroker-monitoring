import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type {
  ActionRow,
  Automation,
  ErrorRow,
  Fill,
  Health,
  LogLine,
  Metric,
  Note,
  RunDetail,
  Snapshot,
} from './types';
import { fmtUsd } from './util';
import { StatusBar } from './components/StatusBar';
import { Topbar } from './components/Topbar';
import { TickerTape } from './components/TickerTape';
import { AutomationRail } from './components/AutomationRail';
import { Identity } from './components/Identity';
import { KpiStrip } from './components/KpiStrip';
import { Chart } from './components/Chart';
import { MetricsExplorer } from './components/MetricsExplorer';
import { Timeline } from './components/Timeline';
import { AccountStanding } from './components/AccountStanding';
import { TimeWindow, WINDOW_OPTIONS } from './components/TimeWindow';

const POLL_INDEX_MS = 3_000;
const POLL_RUN_MS = 2_000;

interface RunBundle {
  run: RunDetail;
  logs: LogLine[];
  metrics: Metric[];
  snapshots: Snapshot[];
  actions: ActionRow[];
  fills: Fill[];
  notes: Note[];
  errors: ErrorRow[];
}

export function App() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<RunBundle | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [equityWindow, setEquityWindow] = useState<string>('all');

  const userPickedRef = useRef(false);

  const refreshIndex = useCallback(async () => {
    setRefreshing(true);
    try {
      const [list, h] = await Promise.all([api.automations(), api.health().catch(() => null)]);
      setAutomations(list);
      setHealth(h);
      setLastUpdated(Date.now());
      setError(null);
      // auto-select most recent only on first load
      setSelectedRunId((current) => {
        if (current && list.some((a) => a.runId === current)) return current;
        if (!userPickedRef.current && list.length > 0) return list[0].runId;
        return current;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  // initial + interval index polling
  useEffect(() => {
    refreshIndex();
    const t = setInterval(refreshIndex, POLL_INDEX_MS);
    return () => clearInterval(t);
  }, [refreshIndex]);

  // run-detail polling driven by selectedRunId + equity time window
  useEffect(() => {
    if (!selectedRunId) {
      setBundle(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const opt = WINDOW_OPTIONS.find((o) => o.key === equityWindow) ?? WINDOW_OPTIONS[WINDOW_OPTIONS.length - 1];
      const snapshotAfter = opt.ms ? Date.now() - opt.ms : null;
      const snapshotLimit = opt.ms === null ? 5000 : 1500;
      try {
        const [run, logs, metrics, snapshots, actions, fills, notes, errors] = await Promise.all([
          api.run(selectedRunId),
          api.logs(selectedRunId, 200),
          api.metrics(selectedRunId, 400),
          api.snapshots(selectedRunId, { limit: snapshotLimit, afterMs: snapshotAfter }),
          api.actions(selectedRunId, 100),
          api.fills(selectedRunId, 100),
          api.notes(selectedRunId, 100),
          api.errors(selectedRunId, 100),
        ]);
        if (cancelled) return;
        setBundle({ run, logs, metrics, snapshots, actions, fills, notes, errors });
        setLastUpdated(Date.now());
      } catch {
        // index polling will surface the error banner
      }
    };
    tick();
    const t = setInterval(tick, POLL_RUN_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedRunId, equityWindow]);

  const sparkSeries = useMemo<Record<string, number[]>>(() => {
    // build a quick equity series per automation — uses latestSnapshot for now
    // (we don't fetch every run's snapshots for perf reasons; this is a stub
    // that gets fleshed out for the selected run)
    const m: Record<string, number[]> = {};
    for (const a of automations) {
      const e = Number(a.latestSnapshot?.equity);
      if (Number.isFinite(e)) m[a.runId] = [e * 0.998, e * 1.001, e]; // gentle visual
    }
    if (selectedRunId && bundle?.snapshots?.length) {
      m[selectedRunId] = [...bundle.snapshots]
        .reverse()
        .map((s) => Number(s.equity))
        .filter(Number.isFinite);
    }
    return m;
  }, [automations, bundle, selectedRunId]);

  const onSelect = useCallback((a: Automation) => {
    userPickedRef.current = true;
    setSelectedRunId(a.runId);
  }, []);

  const equityPoints = useMemo(() => {
    if (!bundle) return [];
    return [...bundle.snapshots]
      .reverse()
      .map((s) => ({ timestamp: Number(s.timestamp), value: Number(s.equity) }))
      .filter((p) => Number.isFinite(p.value) && Number.isFinite(p.timestamp));
  }, [bundle]);

  const equityCallout = useMemo(() => {
    if (equityPoints.length < 1) return null;
    const last = equityPoints[equityPoints.length - 1];
    const first = equityPoints[0];
    const delta = last.value - first.value;
    const pct = first.value !== 0 ? (delta / first.value) * 100 : 0;
    return { last, first, delta, pct };
  }, [equityPoints]);

  return (
    <div className="shell">
      <StatusBar health={health} lastUpdated={lastUpdated} error={error} />
      <Topbar onRefresh={refreshIndex} refreshing={refreshing} />
      <TickerTape automations={automations} />

      {error ? (
        <div className="banner">
          <span className="led bad" />
          UPLINK ERROR · {error}
        </div>
      ) : null}

      <div className="layout">
        <AutomationRail
          automations={automations}
          selectedRunId={selectedRunId}
          onSelect={onSelect}
          sparkSeries={sparkSeries}
        />
        <main className="main">
          {!bundle ? (
            <EmptyStage hasAny={automations.length > 0} />
          ) : (
            <>
              <Identity run={bundle.run} />
              <KpiStrip run={bundle.run} snapshots={bundle.snapshots} />

              <div className="split-2">
                <section className="panel">
                  <div className="panel-head">
                    <div className="lhs">
                      <span className="panel-eyebrow">[A]</span>
                      <span className="panel-title">Equity Trajectory</span>
                    </div>
                    <div className="panel-rhs">
                      <span>{bundle.snapshots.length} snapshots</span>
                      <TimeWindow value={equityWindow} onChange={setEquityWindow} />
                    </div>
                  </div>
                  <div className="chart-wrap">
                    {equityCallout ? (
                      <div className="chart-callout">
                        <span className="now">{fmtUsd(equityCallout.last.value)}</span>
                        <span
                          className={`delta ${
                            equityCallout.delta > 0 ? 'up' : equityCallout.delta < 0 ? 'down' : 'flat'
                          }`}
                        >
                          {equityCallout.delta >= 0 ? '+' : ''}
                          {fmtUsd(equityCallout.delta)} ({equityCallout.pct >= 0 ? '+' : ''}
                          {equityCallout.pct.toFixed(2)}%) over window
                        </span>
                      </div>
                    ) : null}
                    <Chart points={equityPoints} formatValue={(v) => fmtUsd(v, 0)} />
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <div className="lhs">
                      <span className="panel-eyebrow">[B]</span>
                      <span className="panel-title">Metrics Explorer</span>
                    </div>
                    <div className="panel-rhs">
                      <span>{bundle.run.latestMetrics?.length ?? 0} active</span>
                    </div>
                  </div>
                  <MetricsExplorer
                    runId={bundle.run.runId}
                    latestMetrics={bundle.run.latestMetrics ?? []}
                  />
                </section>
              </div>

              <AccountStanding user={bundle.run.accountAddress} />

              <Timeline
                logs={bundle.logs}
                fills={bundle.fills}
                actions={bundle.actions}
                metrics={bundle.metrics}
                notes={bundle.notes}
                errors={bundle.errors}
                counts={bundle.run.counts}
              />
            </>
          )}
        </main>
      </div>

      <footer className="footer">
        <span className="feed-pulse">
          <span className={`led ${error ? 'bad' : 'live'}`} />
          {error ? 'feed offline' : 'feed live · audit sqlite'}
        </span>
        <span>{health?.dbPath ?? '—'}</span>
        <span>poll · index {POLL_INDEX_MS / 1000}s · run {POLL_RUN_MS / 1000}s</span>
      </footer>
    </div>
  );
}

function EmptyStage({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="empty-stage">
      <div>
        <h2>
          await <em>signal</em>
        </h2>
        <p>{hasAny ? 'select an automation from the rail' : 'no automation runs in audit db yet'}</p>
        <div className="crosshair" />
      </div>
    </div>
  );
}
