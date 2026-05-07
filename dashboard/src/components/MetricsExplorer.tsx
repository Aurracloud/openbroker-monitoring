import { useEffect, useMemo, useState } from 'react';
import type { Metric } from '../types';
import { api } from '../api';
import { classNames, fmtNum, fmtTime } from '../util';
import { Chart } from './Chart';

interface Props {
  runId: string;
  latestMetrics: Metric[];
}

export function MetricsExplorer({ runId, latestMetrics }: Props) {
  const names = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; latest: number }[] = [];
    for (const m of latestMetrics) {
      if (seen.has(m.name)) continue;
      seen.add(m.name);
      out.push({ name: m.name, latest: Number(m.value) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [latestMetrics]);

  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!names.length) {
      setSelected(null);
      return;
    }
    if (!selected || !names.some((n) => n.name === selected)) {
      setSelected(names[0].name);
    }
  }, [names, selected]);

  const [series, setSeries] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected || !runId) {
      setSeries([]);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    api
      .metricsByName(runId, selected, 240, controller.signal)
      .then((data) => {
        if (!cancelled) setSeries(data);
      })
      .catch(() => {
        if (!cancelled) setSeries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const interval = setInterval(() => {
      api
        .metricsByName(runId, selected, 240)
        .then((data) => {
          if (!cancelled) setSeries(data);
        })
        .catch(() => {});
    }, 5_000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [runId, selected]);

  const points = useMemo(
    () =>
      [...series]
        .reverse()
        .filter((m) => Number.isFinite(Number(m.value)))
        .map((m) => ({ timestamp: Number(m.timestamp), value: Number(m.value) })),
    [series],
  );

  if (!names.length) {
    return (
      <div className="empty">
        <span className="glyph">∅</span>
        no metrics emitted yet — call api.audit.metric(name, value) from your automation
      </div>
    );
  }

  const last = points[points.length - 1];

  return (
    <div className="metric-explorer">
      <div className="metric-list">
        {names.map((n) => (
          <button
            key={n.name}
            className={classNames('metric-row', selected === n.name && 'active')}
            onClick={() => setSelected(n.name)}
          >
            <span className="name">{n.name}</span>
            <span className="now">{fmtNum(n.latest, 4)}</span>
          </button>
        ))}
      </div>
      <div className="metric-canvas">
        <div className="metric-headline">
          <span className="name">{selected ?? '—'}</span>
          <span className="now">{last ? fmtNum(last.value, 4) : '—'}</span>
          <span style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {loading ? 'syncing' : last ? `${fmtTime(last.timestamp)} · ${points.length} pts` : 'no data'}
          </span>
        </div>
        <Chart points={points} height={200} formatValue={(v) => fmtNum(v, 4)} />
      </div>
    </div>
  );
}
