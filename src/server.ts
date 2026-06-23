import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export interface MonitoringServerOptions {
  port?: number;
  host?: string;
  dbPath?: string;
  staticDir?: string;
}

type JsonRecord = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(os.homedir(), '.openbroker', 'automation-audit.sqlite');
const DEFAULT_STATIC_DIR = path.resolve(__dirname, '..', 'public');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? value as JsonRecord : {};
}

function isProcessAlive(pid: unknown): boolean {
  if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function normalizeRun(row: unknown): JsonRecord {
  const r = asObject(row);
  const pid = Number(r.pid ?? 0);
  const dbStatus = String(r.status ?? 'unknown');
  const alive = dbStatus === 'running' && isProcessAlive(pid);
  const status = dbStatus === 'running' && !alive ? 'stale' : dbStatus;
  return {
    runId: r.run_id,
    automationId: r.automation_id,
    scriptPath: r.script_path,
    accountAddress: r.account_address,
    walletAddress: r.wallet_address,
    isApiWallet: Boolean(r.is_api_wallet),
    dryRun: Boolean(r.dry_run),
    verbose: Boolean(r.verbose),
    pollIntervalMs: r.poll_interval_ms,
    useWebSocket: Boolean(r.use_websocket),
    pid,
    processAlive: alive,
    startedAt: r.started_at,
    stoppedAt: r.stopped_at,
    status,
    stopReason: r.stop_reason,
    initialState: parseJson(r.initial_state_json),
    persistedState: parseJson(r.persisted_state_json),
    pollCount: r.poll_count,
    eventsEmitted: r.events_emitted,
  };
}

function normalizeSnapshot(row: unknown): JsonRecord | null {
  if (!row) return null;
  const r = asObject(row);
  return {
    id: r.id,
    runId: r.run_id,
    timestamp: r.timestamp,
    pollCount: r.poll_count,
    equity: r.equity,
    marginUsed: r.margin_used,
    marginUsedPct: r.margin_used_pct,
    positions: parseJson(r.positions_json),
  };
}

function normalizeMetric(row: unknown): JsonRecord {
  const r = asObject(row);
  return {
    id: r.id,
    runId: r.run_id,
    timestamp: r.timestamp,
    name: r.name,
    value: r.value,
    tags: parseJson(r.tags_json),
  };
}

function normalizeLog(row: unknown): JsonRecord {
  const r = asObject(row);
  return {
    id: r.id,
    runId: r.run_id,
    timestamp: r.timestamp,
    level: r.level,
    message: r.message,
  };
}

function normalizeAction(row: unknown): JsonRecord {
  const r = asObject(row);
  return {
    id: r.id,
    runId: r.run_id,
    timestamp: r.timestamp,
    actionId: r.action_id,
    phase: r.phase,
    method: r.method,
    dryRun: Boolean(r.dry_run),
    payload: parseJson(r.payload_json),
    result: parseJson(r.result_json),
    error: parseJson(r.error_json),
  };
}

function normalizeFill(row: unknown): JsonRecord {
  const r = asObject(row);
  return {
    id: r.id,
    runId: r.run_id,
    timestamp: r.timestamp,
    coin: r.coin,
    side: r.side,
    size: r.size,
    price: r.price,
    fee: r.fee,
    closedPnl: r.closed_pnl,
    oid: r.oid,
    crossed: Boolean(r.crossed),
    payload: parseJson(r.payload_json),
  };
}

function normalizeNote(row: unknown): JsonRecord {
  const r = asObject(row);
  return {
    id: r.id,
    runId: r.run_id,
    timestamp: r.timestamp,
    kind: r.kind,
    payload: parseJson(r.payload_json),
  };
}

function normalizeError(row: unknown): JsonRecord {
  const r = asObject(row);
  return {
    id: r.id,
    runId: r.run_id,
    timestamp: r.timestamp,
    stage: r.stage,
    error: parseJson(r.error_json),
  };
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function getLimit(url: URL, fallback = 100, max = 5000): number {
  const parsed = Number(url.searchParams.get('limit') ?? fallback);
  return Math.max(1, Math.min(Number.isFinite(parsed) ? parsed : fallback, max));
}

function getRange(url: URL): { before: number | null; after: number | null } {
  const before = Number(url.searchParams.get('before'));
  const after = Number(url.searchParams.get('after'));
  return {
    before: Number.isFinite(before) && before > 0 ? before : null,
    after: Number.isFinite(after) && after > 0 ? after : null,
  };
}

function createApi(db: DatabaseSync, dbPath: string) {
  db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;');

  function latestSnapshot(runId: string): JsonRecord | null {
    return normalizeSnapshot(db.prepare(`
      SELECT * FROM automation_snapshots
      WHERE run_id = ?
      ORDER BY timestamp DESC, id DESC
      LIMIT 1
    `).get(runId));
  }

  function latestMetrics(runId: string): JsonRecord[] {
    return db.prepare(`
      SELECT m.*
      FROM automation_metrics m
      JOIN (
        SELECT name, MAX(timestamp) AS timestamp
        FROM automation_metrics
        WHERE run_id = ?
        GROUP BY name
      ) latest ON latest.name = m.name AND latest.timestamp = m.timestamp
      WHERE m.run_id = ?
      ORDER BY m.name ASC
    `).all(runId, runId).map(normalizeMetric);
  }

  function guardrailSummary(runId: string): JsonRecord {
    const configured = asObject(db.prepare(`
      SELECT timestamp, payload_json
      FROM automation_notes
      WHERE run_id = ? AND kind = 'guardrails'
      ORDER BY timestamp DESC, id DESC
      LIMIT 1
    `).get(runId));
    const blockStats = asObject(db.prepare(`
      SELECT COUNT(*) AS blocks, MAX(timestamp) AS last_block_at
      FROM automation_notes
      WHERE run_id = ? AND kind = 'guardrail_block'
    `).get(runId));

    return {
      policy: configured.payload_json ? parseJson(configured.payload_json) : null,
      configuredAt: configured.timestamp ?? null,
      blocks: Number(blockStats.blocks ?? 0),
      lastBlockAt: blockStats.last_block_at ?? null,
    };
  }

  return {
    health() {
      return {
        status: 'ok',
        timestamp: Date.now(),
        dbPath,
        dbExists: existsSync(dbPath),
        dbSizeBytes: existsSync(dbPath) ? statSync(dbPath).size : 0,
      };
    },

    automations() {
      const rows = db.prepare(`
        SELECT r.*
        FROM automation_runs r
        JOIN (
          SELECT automation_id, MAX(started_at) AS started_at
          FROM automation_runs
          GROUP BY automation_id
        ) latest ON latest.automation_id = r.automation_id AND latest.started_at = r.started_at
        ORDER BY r.started_at DESC
      `).all();

      return rows.map((row) => {
        const run = normalizeRun(row);
        const runId = String(run.runId);
        const snapshot = latestSnapshot(runId);
        const counts = asObject(db.prepare(`
          SELECT
            (SELECT COUNT(*) FROM automation_errors WHERE run_id = ?) AS errors,
            (SELECT COUNT(*) FROM automation_fills WHERE run_id = ?) AS fills,
            (SELECT COUNT(*) FROM automation_actions WHERE run_id = ?) AS actions,
            (SELECT COUNT(*) FROM automation_logs WHERE run_id = ?) AS logs,
            (SELECT COUNT(*) FROM automation_notes WHERE run_id = ? AND kind = 'guardrail_block') AS guardrailBlocks
        `).get(runId, runId, runId, runId, runId));
        return { ...run, latestSnapshot: snapshot, latestMetrics: latestMetrics(runId), counts };
      });
    },

    runs(automationId: string, limit: number) {
      return db.prepare(`
        SELECT * FROM automation_runs
        WHERE automation_id = ?
        ORDER BY started_at DESC
        LIMIT ?
      `).all(automationId, limit).map(normalizeRun);
    },

    run(runId: string) {
      const row = db.prepare('SELECT * FROM automation_runs WHERE run_id = ?').get(runId);
      if (!row) return null;
      return {
        ...normalizeRun(row),
        latestSnapshot: latestSnapshot(runId),
        latestMetrics: latestMetrics(runId),
        guardrails: guardrailSummary(runId),
        counts: asObject(db.prepare(`
          SELECT
            (SELECT COUNT(*) FROM automation_errors WHERE run_id = ?) AS errors,
            (SELECT COUNT(*) FROM automation_fills WHERE run_id = ?) AS fills,
            (SELECT COUNT(*) FROM automation_actions WHERE run_id = ?) AS actions,
            (SELECT COUNT(*) FROM automation_notes WHERE run_id = ?) AS notes,
            (SELECT COUNT(*) FROM automation_metrics WHERE run_id = ?) AS metrics,
            (SELECT COUNT(*) FROM automation_logs WHERE run_id = ?) AS logs,
            (SELECT COUNT(*) FROM automation_notes WHERE run_id = ? AND kind = 'guardrail_block') AS guardrailBlocks
        `).get(runId, runId, runId, runId, runId, runId, runId)),
      };
    },

    logs(runId: string, limit: number) {
      return db.prepare(`
        SELECT * FROM automation_logs
        WHERE run_id = ?
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      `).all(runId, limit).map(normalizeLog);
    },

    metrics(runId: string, name: string | null, limit: number, range: { before: number | null; after: number | null } = { before: null, after: null }) {
      const where: string[] = ['run_id = ?'];
      const params: (string | number)[] = [runId];
      if (name) { where.push('name = ?'); params.push(name); }
      if (range.before) { where.push('timestamp < ?'); params.push(range.before); }
      if (range.after) { where.push('timestamp > ?'); params.push(range.after); }
      params.push(limit);
      return db.prepare(`
        SELECT * FROM automation_metrics
        WHERE ${where.join(' AND ')}
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      `).all(...params).map(normalizeMetric);
    },

    snapshots(runId: string, limit: number, range: { before: number | null; after: number | null } = { before: null, after: null }) {
      const where: string[] = ['run_id = ?'];
      const params: (string | number)[] = [runId];
      if (range.before) { where.push('timestamp < ?'); params.push(range.before); }
      if (range.after) { where.push('timestamp > ?'); params.push(range.after); }
      params.push(limit);
      return db.prepare(`
        SELECT * FROM automation_snapshots
        WHERE ${where.join(' AND ')}
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      `).all(...params).map(normalizeSnapshot);
    },

    actions(runId: string, limit: number) {
      return db.prepare(`
        SELECT * FROM automation_actions
        WHERE run_id = ?
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      `).all(runId, limit).map(normalizeAction);
    },

    fills(runId: string, limit: number) {
      return db.prepare(`
        SELECT * FROM automation_fills
        WHERE run_id = ?
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      `).all(runId, limit).map(normalizeFill);
    },

    notes(runId: string, limit: number) {
      return db.prepare(`
        SELECT * FROM automation_notes
        WHERE run_id = ?
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      `).all(runId, limit).map(normalizeNote);
    },

    errors(runId: string, limit: number) {
      return db.prepare(`
        SELECT * FROM automation_errors
        WHERE run_id = ?
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      `).all(runId, limit).map(normalizeError);
    },
  };
}

function serveStatic(reqPath: string, res: ServerResponse, staticDir: string): void {
  const normalized = reqPath === '/' ? '/index.html' : reqPath;
  const safePath = path.normalize(normalized).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(staticDir, safePath);

  let filePath = fullPath;
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = path.join(staticDir, 'index.html');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300',
  });
  res.end(readFileSync(filePath));
}

export function createMonitoringServer(options: MonitoringServerOptions = {}) {
  const dbPath = path.resolve(options.dbPath ?? process.env.OPENBROKER_AUDIT_DB_PATH ?? DEFAULT_DB_PATH);
  const staticDir = path.resolve(options.staticDir ?? DEFAULT_STATIC_DIR);
  const db = new DatabaseSync(dbPath);
  const api = createApi(db, dbPath);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        writeJson(res, 200, api.health());
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/automations') {
        writeJson(res, 200, api.automations());
        return;
      }

      const parts = url.pathname.split('/').filter(Boolean);
      if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'automations' && parts[3] === 'runs') {
        writeJson(res, 200, api.runs(decodeURIComponent(parts[2] ?? ''), getLimit(url, 20, 200)));
        return;
      }

      if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'runs' && parts[2]) {
        const runId = decodeURIComponent(parts[2]);
        const resource = parts[3] ?? '';
        const limit = getLimit(url);
        if (!resource) {
          const run = api.run(runId);
          if (!run) writeJson(res, 404, { error: 'run not found' });
          else writeJson(res, 200, run);
          return;
        }
        if (resource === 'logs') writeJson(res, 200, api.logs(runId, limit));
        else if (resource === 'metrics') writeJson(res, 200, api.metrics(runId, url.searchParams.get('name'), limit, getRange(url)));
        else if (resource === 'snapshots') writeJson(res, 200, api.snapshots(runId, limit, getRange(url)));
        else if (resource === 'actions') writeJson(res, 200, api.actions(runId, limit));
        else if (resource === 'fills') writeJson(res, 200, api.fills(runId, limit));
        else if (resource === 'notes') writeJson(res, 200, api.notes(runId, limit));
        else if (resource === 'errors') writeJson(res, 200, api.errors(runId, limit));
        else writeJson(res, 404, { error: 'unknown run resource' });
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        writeJson(res, 404, { error: 'not found' });
        return;
      }

      serveStatic(url.pathname, res, staticDir);
    } catch (error) {
      writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return {
    server,
    dbPath,
    staticDir,
    close() {
      server.close();
      db.close();
    },
  };
}

export async function startMonitoringServer(options: MonitoringServerOptions = {}) {
  const port = options.port ?? Number(process.env.OB_MONITOR_PORT ?? 3001);
  const host = options.host ?? process.env.OB_MONITOR_HOST ?? '127.0.0.1';
  const instance = createMonitoringServer(options);
  await new Promise<void>((resolve, reject) => {
    instance.server.once('error', reject);
    instance.server.listen(port, host, () => {
      instance.server.off('error', reject);
      resolve();
    });
  });
  return { ...instance, port, host, url: `http://${host}:${port}` };
}
