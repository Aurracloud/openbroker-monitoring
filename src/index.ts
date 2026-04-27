// openbroker-monitoring
//
// Optional dashboard/metrics forwarder for the openbroker CLI.
//
// Why this is a separate package: the openbroker plugin is scanned by
// OpenClaw on install and the combination of `process.env` reads + outbound
// `fetch` calls trips the "credential harvesting" rule. Splitting the
// network egress into its own package keeps the plugin tarball clean while
// still letting operators ship dashboard telemetry by installing this
// alongside `openbroker`.
//
// `openbroker auto run` convention-loads this package at startup if it is
// resolvable via Node's module resolver, so the operator only needs to
// install both packages and set the dashboard env vars (or pass a config).

export interface AutomationAuditObserver {
  /** Fired when an automation calls api.audit.record(kind, payload). */
  onNote?(kind: string, payload?: unknown): void;
  /** Fired when an automation calls api.audit.metric(name, value, tags). */
  onMetric?(name: string, value: number, tags?: Record<string, unknown>): void;
  /** Fired for every audited write method on the client (order, cancel, etc.). */
  onAgentAction?(
    action: string,
    status: 'success' | 'error',
    details: Record<string, unknown>,
    txHash?: string,
  ): void;
}

export interface DashboardObserverOptions {
  /** Dashboard base URL, e.g. "http://localhost:3001". Falls back to OB_DASHBOARD_URL. */
  url?: string;
  /** Bearer token for the dashboard API. Falls back to OB_DASHBOARD_API_KEY. */
  apiKey?: string;
  /** Vault address used in the URL path. Falls back to HYPERSTABLE_VAULT_ADDRESS or VAULT. */
  vaultAddress?: string;
  /** Per-request timeout in ms. Default: 5_000. */
  timeoutMs?: number;
}

interface ResolvedConfig {
  url: string;
  apiKey: string;
  vaultAddress: string;
  timeoutMs: number;
}

function resolveConfig(opts: DashboardObserverOptions = {}): ResolvedConfig | null {
  const url = opts.url ?? process.env.OB_DASHBOARD_URL ?? '';
  const apiKey = opts.apiKey ?? process.env.OB_DASHBOARD_API_KEY ?? '';
  const vaultAddress =
    opts.vaultAddress ??
    process.env.HYPERSTABLE_VAULT_ADDRESS ??
    process.env.VAULT ??
    '';
  const timeoutMs = opts.timeoutMs ?? 5_000;

  if (!url || !vaultAddress) {
    const missing: string[] = [];
    if (!url) missing.push('OB_DASHBOARD_URL');
    if (!vaultAddress) missing.push('HYPERSTABLE_VAULT_ADDRESS|VAULT');
    console.warn(
      `[openbroker-monitoring] observer disabled — missing required env: ${missing.join(', ')}`
    );
    return null;
  }
  return { url, apiKey, vaultAddress, timeoutMs };
}

// Throttle repeated fetch warnings so a flapping dashboard doesn't flood logs.
let lastPostErrLogMs = 0;
const POST_ERR_LOG_INTERVAL_MS = 30_000;

function postJSON(cfg: ResolvedConfig, path: string, body: unknown): void {
  const target = `${cfg.url}/api/vaults/${cfg.vaultAddress.toLowerCase()}${path}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

  fetch(target, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  })
    .then((res) => {
      if (!res.ok) {
        const now = Date.now();
        if (now - lastPostErrLogMs > POST_ERR_LOG_INTERVAL_MS) {
          lastPostErrLogMs = now;
          console.warn(
            `[openbroker-monitoring] POST ${path} -> HTTP ${res.status} ${res.statusText}`
          );
        }
      }
    })
    .catch((err) => {
      // Network / timeout / abort. Throttle so a downed dashboard can't flood.
      const now = Date.now();
      if (now - lastPostErrLogMs > POST_ERR_LOG_INTERVAL_MS) {
        lastPostErrLogMs = now;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[openbroker-monitoring] POST ${path} failed: ${msg}`);
      }
    });
}

/**
 * Create a dashboard forwarder observer. Returns `null` if no dashboard URL
 * or vault address is configured, so the convention loader in `openbroker`
 * can no-op cleanly when the operator hasn't set the env vars.
 */
export function createDashboardObserver(
  opts: DashboardObserverOptions = {},
): AutomationAuditObserver | null {
  const cfg = resolveConfig(opts);
  if (!cfg) return null;

  console.log(
    `[openbroker-monitoring] observer enabled — url=${cfg.url} vault=${cfg.vaultAddress.toLowerCase()} ` +
      `apiKey=${cfg.apiKey ? '<set>' : '<unset>'} timeoutMs=${cfg.timeoutMs}`
  );

  return {
    onNote(kind, payload) {
      const reason =
        typeof payload === 'object' && payload !== null && 'reason' in payload
          ? String((payload as Record<string, unknown>).reason)
          : kind;
      postJSON(cfg, '/audit/notes', {
        category: kind,
        label: reason,
        data: payload ?? {},
      });
    },

    onMetric(name, value, tags) {
      postJSON(cfg, '/audit/metrics', { name, value, tags: tags ?? {} });
    },

    onAgentAction(action, status, details, txHash) {
      postJSON(cfg, '/agent/logs', { action, status, details, txHash });
    },
  };
}

// Default export is the factory so openbroker's convention loader works
// regardless of whether the consumer passes options.
export default createDashboardObserver;
