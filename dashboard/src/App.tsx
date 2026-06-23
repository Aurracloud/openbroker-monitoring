import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { ActionRow, Automation, ErrorRow, Fill, Health, LogLine, Metric, Note, RunDetail, Snapshot } from './types';
import { fmtUsd } from './util';
import { Topbar } from './components/Topbar';
import { AutomationRail } from './components/AutomationRail';
import { Chart } from './components/Chart';
import { MetricsExplorer } from './components/MetricsExplorer';
import { Timeline } from './components/Timeline';
import { TimeWindow, WINDOW_OPTIONS } from './components/TimeWindow';
import { RiskOverview } from './components/RiskOverview';
import { PerformanceStrip } from './components/PerformanceStrip';
import { GuardrailPanel } from './components/GuardrailPanel';

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
  const [equityWindow, setEquityWindow] = useState<string>('24h');
  const userPickedRef = useRef(false);

  const refreshIndex = useCallback(async () => {
    setRefreshing(true);
    try {
      const [list, nextHealth] = await Promise.all([api.automations(), api.health().catch(() => null)]);
      setAutomations(list);
      setHealth(nextHealth);
      setLastUpdated(Date.now());
      setError(null);
      setSelectedRunId((current) => {
        if (current && list.some((automation) => automation.runId === current)) return current;
        if (!userPickedRef.current && list.length > 0) return list[0].runId;
        return current;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshIndex();
    const interval = setInterval(refreshIndex, POLL_INDEX_MS);
    return () => clearInterval(interval);
  }, [refreshIndex]);

  useEffect(() => {
    if (!selectedRunId) {
      setBundle(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const option = WINDOW_OPTIONS.find((item) => item.key === equityWindow) ?? WINDOW_OPTIONS[2];
      const snapshotAfter = option.ms ? Date.now() - option.ms : null;
      const snapshotLimit = option.ms === null ? 5000 : 1500;
      try {
        const [run, logs, metrics, snapshots, actions, fills, notes, errors] = await Promise.all([
          api.run(selectedRunId),
          api.logs(selectedRunId, 200),
          api.metrics(selectedRunId, 400),
          api.snapshots(selectedRunId, { limit: snapshotLimit, afterMs: snapshotAfter }),
          api.actions(selectedRunId, 100),
          api.fills(selectedRunId, 100),
          api.notes(selectedRunId, 150),
          api.errors(selectedRunId, 100),
        ]);
        if (cancelled) return;
        setBundle({ run, logs, metrics, snapshots, actions, fills, notes, errors });
        setLastUpdated(Date.now());
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    };
    tick();
    const interval = setInterval(tick, POLL_RUN_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedRunId, equityWindow]);

  const sparkSeries = useMemo<Record<string, number[]>>(() => {
    if (!selectedRunId || !bundle?.snapshots.length) return {};
    return {
      [selectedRunId]: [...bundle.snapshots]
        .reverse()
        .map((snapshot) => Number(snapshot.equity))
        .filter(Number.isFinite),
    };
  }, [bundle, selectedRunId]);

  const equityPoints = useMemo(() => {
    if (!bundle) return [];
    return [...bundle.snapshots]
      .reverse()
      .map((snapshot) => ({ timestamp: Number(snapshot.timestamp), value: Number(snapshot.equity) }))
      .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.timestamp));
  }, [bundle]);

  const equityCallout = useMemo(() => {
    if (!equityPoints.length) return null;
    const first = equityPoints[0];
    const last = equityPoints[equityPoints.length - 1];
    return { last, delta: last.value - first.value };
  }, [equityPoints]);

  const latestMetrics = bundle?.run.latestMetrics ?? [];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span>openbroker</span><i className="pulse-dot" /></div>
        <AutomationRail
          automations={automations}
          selectedRunId={selectedRunId}
          onSelect={(automation) => {
            userPickedRef.current = true;
            setSelectedRunId(automation.runId);
          }}
          sparkSeries={sparkSeries}
        />
        <div className="sidebar-status">
          <span className={`led ${error ? 'bad' : 'live'}`} />
          <span>{error ? 'Monitor disconnected' : 'Audit feed connected'}</span>
        </div>
      </aside>

      <div className="workspace">
        <Topbar
          onRefresh={refreshIndex}
          refreshing={refreshing}
          run={bundle?.run ?? null}
          health={health}
          lastUpdated={lastUpdated}
          error={error}
        />

        <main className="dashboard-main">
          {error ? <div className="banner"><span className="led bad" />Monitor error · {error}</div> : null}
          {!bundle ? (
            <EmptyStage hasAny={automations.length > 0} />
          ) : (
            <>
              <RiskOverview run={bundle.run} logs={bundle.logs} />
              <PerformanceStrip run={bundle.run} snapshots={bundle.snapshots} metrics={latestMetrics} />

              <div className="primary-grid">
                <section className="panel equity-panel">
                  <div className="panel-head">
                    <div><span className="section-kicker">Portfolio</span><h2>Equity &amp; exposure</h2></div>
                    <TimeWindow value={equityWindow} onChange={setEquityWindow} />
                  </div>
                  <div className="chart-summary">
                    <div><strong>{fmtUsd(equityCallout?.last.value)}</strong><span>Current equity</span></div>
                    <div className={equityCallout && equityCallout.delta < 0 ? 'neg' : 'pos'}>
                      <strong>{equityCallout ? `${equityCallout.delta >= 0 ? '+' : ''}${fmtUsd(equityCallout.delta)}` : '—'}</strong>
                      <span>Over selected window</span>
                    </div>
                  </div>
                  <div className="chart-wrap"><Chart points={equityPoints} height={250} formatValue={(value) => fmtUsd(value, 0)} /></div>
                </section>
                <GuardrailPanel run={bundle.run} metrics={latestMetrics} actions={bundle.actions} />
              </div>

              <Timeline
                logs={bundle.logs}
                fills={bundle.fills}
                actions={bundle.actions}
                notes={bundle.notes}
                errors={bundle.errors}
                counts={bundle.run.counts}
              />

              <section className="panel telemetry-panel">
                <div className="panel-head">
                  <div><span className="section-kicker">Deep telemetry</span><h2>Metric explorer</h2></div>
                  <span className="panel-note">{latestMetrics.length} live series</span>
                </div>
                <MetricsExplorer runId={bundle.run.runId} latestMetrics={latestMetrics} />
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyStage({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="empty-stage">
      <span className="empty-orbit" />
      <h2>{hasAny ? 'Select an automation' : 'No automation runs yet'}</h2>
      <p>{hasAny ? 'Choose a run from the left rail to inspect its risk posture.' : 'The monitor will populate when an audited automation starts.'}</p>
    </div>
  );
}
