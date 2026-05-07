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

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: (signal?: AbortSignal) => getJson<Health>('/api/health', signal),
  automations: (signal?: AbortSignal) => getJson<Automation[]>('/api/automations', signal),
  run: (runId: string, signal?: AbortSignal) =>
    getJson<RunDetail>(`/api/runs/${encodeURIComponent(runId)}`, signal),
  logs: (runId: string, limit = 200, signal?: AbortSignal) =>
    getJson<LogLine[]>(`/api/runs/${encodeURIComponent(runId)}/logs?limit=${limit}`, signal),
  metrics: (runId: string, limit = 400, signal?: AbortSignal) =>
    getJson<Metric[]>(`/api/runs/${encodeURIComponent(runId)}/metrics?limit=${limit}`, signal),
  metricsByName: (
    runId: string,
    name: string,
    opts: { limit?: number; afterMs?: number | null } = {},
    signal?: AbortSignal,
  ) => {
    const limit = opts.limit ?? 1500;
    const params = new URLSearchParams({ name, limit: String(limit) });
    if (opts.afterMs && Number.isFinite(opts.afterMs)) params.set('after', String(Math.floor(opts.afterMs)));
    return getJson<Metric[]>(`/api/runs/${encodeURIComponent(runId)}/metrics?${params.toString()}`, signal);
  },
  snapshots: (
    runId: string,
    opts: { limit?: number; afterMs?: number | null } = {},
    signal?: AbortSignal,
  ) => {
    const limit = opts.limit ?? 1500;
    const params = new URLSearchParams({ limit: String(limit) });
    if (opts.afterMs && Number.isFinite(opts.afterMs)) params.set('after', String(Math.floor(opts.afterMs)));
    return getJson<Snapshot[]>(`/api/runs/${encodeURIComponent(runId)}/snapshots?${params.toString()}`, signal);
  },
  actions: (runId: string, limit = 100, signal?: AbortSignal) =>
    getJson<ActionRow[]>(`/api/runs/${encodeURIComponent(runId)}/actions?limit=${limit}`, signal),
  fills: (runId: string, limit = 100, signal?: AbortSignal) =>
    getJson<Fill[]>(`/api/runs/${encodeURIComponent(runId)}/fills?limit=${limit}`, signal),
  notes: (runId: string, limit = 100, signal?: AbortSignal) =>
    getJson<Note[]>(`/api/runs/${encodeURIComponent(runId)}/notes?limit=${limit}`, signal),
  errors: (runId: string, limit = 100, signal?: AbortSignal) =>
    getJson<ErrorRow[]>(`/api/runs/${encodeURIComponent(runId)}/errors?limit=${limit}`, signal),
};
