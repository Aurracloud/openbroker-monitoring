# openbroker-monitoring

Local dashboard and optional remote telemetry forwarder for [`openbroker`](https://www.npmjs.com/package/openbroker) automations.

The package now has two jobs:

- serve a local browser dashboard for any OpenBroker automation by reading the existing `~/.openbroker/automation-audit.sqlite` database
- keep the legacy dashboard observer that forwards audit notes/metrics/actions to vault-scoped HTTP endpoints when `OB_DASHBOARD_URL` and a vault address are configured

## Install

```bash
openbroker install monitoring
```

This installs `openbroker-monitoring@latest` globally and exposes the `openbroker-monitoring` command. It is safe to run again when upgrading.

Direct npm fallback:

```bash
npm install --global openbroker-monitoring@latest
```

## Operate the Local Dashboard

Run your automation in one terminal:

```bash
openbroker auto run ./my-automation.ts --id my-auto
```

Run the monitor in another terminal:

```bash
openbroker-monitoring serve --host 127.0.0.1 --port 3001
```

Then open:

```text
http://127.0.0.1:3001
```

The dashboard reads OpenBroker's audit database directly, so it works for any automation that uses the standard `openbroker auto run` runtime. No vault address, registry entry, webhook, or dashboard env vars are required.

Stop the monitor with `Ctrl+C`. Restart the command after changing its host, port, database path, or installed version. Restarting the monitor does not stop or restart any trading automation.

## Upgrade

Install the latest published release, then restart the monitor process:

```bash
openbroker install monitoring
openbroker-monitoring serve --host 127.0.0.1 --port 3001
```

Install an exact release when you need to pin or roll back:

```bash
openbroker install monitoring --tag 1.4.2
```

Preview without changing the installation:

```bash
openbroker install monitoring --dry
```

### Dashboard Features

- generic across any `openbroker auto run` automation — no per-strategy assumptions baked in
- live ticker tape with aggregated fleet signals (running / stale / errored / dry / equity Σ / fills Σ)
- searchable + filterable automation rail with per-run mini equity sparklines and pulsing status LEDs
- portfolio NAV trajectory chart with hover crosshair and automatic window delta callout
- metrics explorer: every metric the automation emits via `api.audit.metric` becomes a selectable, charted series
- timeline tabs: logs · fills · actions · metrics · notes · errors with live counts
- latest run metadata, script path, dry/live mode, PID, account/wallet, websocket flag
- 2s detail polling, 3s index polling, abort-aware fetch

### Dashboard Architecture

The dashboard is a React 19 + TypeScript app under `dashboard/`, built once with Vite and emitted into `public/`. The static HTTP server in `src/server.ts` serves whatever is in `public/`, so consumers don't need a build step at install time.

```bash
# develop the dashboard against a running monitor (proxies /api → :3001)
npm run dashboard:install   # one time
npm run dashboard:dev

# build the production bundle into public/
npm run dashboard:build
```

`prepack` runs `dashboard:build` automatically so `npm publish` ships fresh assets.

### Configuration

| Env var | Purpose |
| --- | --- |
| `OB_MONITOR_PORT` | Local dashboard port. Default: `3001`. |
| `OB_MONITOR_HOST` | Local dashboard host. Default: `127.0.0.1`. |
| `OPENBROKER_AUDIT_DB_PATH` | Audit SQLite path. Default: `~/.openbroker/automation-audit.sqlite`. |

Equivalent CLI flags:

```bash
openbroker-monitoring serve --host 127.0.0.1 --port 3001 --db ~/.openbroker/automation-audit.sqlite
```

## Programmatic Server

```ts
import { startMonitoringServer } from "openbroker-monitoring/server";

const server = await startMonitoringServer({ port: 3001 });
console.log(server.url);
```

## API

The local server exposes generic automation endpoints:

- `GET /api/health`
- `GET /api/automations`
- `GET /api/automations/:automationId/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/logs`
- `GET /api/runs/:runId/metrics`
- `GET /api/runs/:runId/snapshots`
- `GET /api/runs/:runId/actions`
- `GET /api/runs/:runId/fills`
- `GET /api/runs/:runId/notes`
- `GET /api/runs/:runId/errors`

## Legacy Remote Observer

`openbroker auto run` convention-loads this package as an audit observer when it is installed alongside OpenBroker. The observer remains optional and only enables when these env vars are present:

| Env var | Purpose |
| --- | --- |
| `OB_DASHBOARD_URL` | Remote dashboard base URL, e.g. `http://localhost:3001`. |
| `OB_DASHBOARD_API_KEY` | Bearer token sent as `Authorization: Bearer <key>`. Optional. |
| `HYPERSTABLE_VAULT_ADDRESS` or `VAULT` | Vault address used in the legacy URL path. |

Legacy endpoints called by the observer:

- `POST {url}/api/vaults/{vault}/audit/notes`
- `POST {url}/api/vaults/{vault}/audit/metrics`
- `POST {url}/api/vaults/{vault}/agent/logs`

The local generic dashboard does not require this observer path because it reads the audit DB directly.
