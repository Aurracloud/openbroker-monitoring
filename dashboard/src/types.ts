// Mirrors the JSON shapes returned by openbroker-monitoring/src/server.ts.
// Kept structural and tolerant — the audit DB is append-only and may grow new
// columns without us redeploying the dashboard.

export type RunStatus = 'running' | 'stopped' | 'error' | 'stale' | 'unknown' | string;

export interface AutomationCounts {
  errors?: number;
  fills?: number;
  actions?: number;
  logs?: number;
  metrics?: number;
  notes?: number;
  guardrailBlocks?: number;
}

export interface GuardrailPolicy {
  mode?: string;
  allowedMarkets?: string[];
  maxOrderUsd?: number;
  maxPositionUsd?: number;
  maxTotalExposureUsd?: number;
  maxLeverage?: number;
  maxMarginUsedPct?: number;
  maxOpenOrders?: number;
  maxOrdersPerMinute?: number;
  maxSlippageBps?: number;
  allowMarketOrders?: boolean;
  allowAccountWideCancel?: boolean;
  [key: string]: unknown;
}

export interface GuardrailSummary {
  policy?: GuardrailPolicy | null;
  configuredAt?: number | null;
  blocks?: number;
  lastBlockAt?: number | null;
}

export interface Snapshot {
  id?: number;
  runId?: string;
  timestamp: number;
  pollCount?: number;
  equity?: number;
  spotValueUsd?: number | null;
  portfolioValue?: number | null;
  marginUsed?: number;
  marginUsedPct?: number;
  positions?: unknown;
}

export interface Metric {
  id?: number;
  runId?: string;
  timestamp: number;
  name: string;
  value: number;
  tags?: Record<string, unknown>;
}

export interface LogLine {
  id?: number;
  runId?: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug' | string;
  message: string;
}

export interface ActionRow {
  id?: number;
  runId?: string;
  timestamp: number;
  actionId?: string;
  phase: 'request' | 'response' | 'error' | string;
  method: string;
  dryRun?: boolean;
  payload?: unknown;
  result?: unknown;
  error?: unknown;
}

export interface Fill {
  id?: number;
  runId?: string;
  timestamp: number;
  coin: string;
  side: 'buy' | 'sell' | string;
  size: number;
  price: number;
  fee?: number;
  closedPnl?: number;
  oid?: number;
  crossed?: boolean;
  payload?: unknown;
}

export interface Note {
  id?: number;
  runId?: string;
  timestamp: number;
  kind: string;
  payload?: unknown;
}

export interface ErrorRow {
  id?: number;
  runId?: string;
  timestamp: number;
  stage: string;
  error?: unknown;
}

export interface Automation {
  runId: string;
  automationId: string;
  scriptPath?: string;
  accountAddress?: string;
  walletAddress?: string;
  isApiWallet?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  pollIntervalMs?: number;
  useWebSocket?: boolean;
  pid?: number;
  processAlive?: boolean;
  startedAt?: number;
  stoppedAt?: number | null;
  status: RunStatus;
  stopReason?: string | null;
  initialState?: Record<string, unknown>;
  persistedState?: Record<string, unknown>;
  pollCount?: number;
  eventsEmitted?: number;
  latestSnapshot?: Snapshot | null;
  latestMetrics?: Metric[];
  counts?: AutomationCounts;
}

export interface RunDetail extends Automation {
  latestSnapshot?: Snapshot | null;
  latestMetrics?: Metric[];
  counts?: AutomationCounts;
  guardrails?: GuardrailSummary;
}

export interface Health {
  status: string;
  timestamp: number;
  dbPath: string;
  dbExists: boolean;
  dbSizeBytes: number;
}
