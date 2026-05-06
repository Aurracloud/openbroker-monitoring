# openbroker-monitoring

Local dashboard and optional remote telemetry forwarder for [`openbroker`](https://www.npmjs.com/package/openbroker) automations.

The package now has two jobs:

- serve a local browser dashboard for any OpenBroker automation by reading the existing `~/.openbroker/automation-audit.sqlite` database
- keep the legacy dashboard observer that forwards audit notes/metrics/actions to vault-scoped HTTP endpoints when `OB_DASHBOARD_URL` and a vault address are configured

## Install

```bash
npm install openbroker openbroker-monitoring
```

## Local Dashboard

Run your automation in one terminal:

```bash
openbroker auto run ./my-automation.ts --id my-auto
```

Run the monitor in another terminal:

```bash
openbroker-monitoring serve --port 3001
```

Then open:

```text
http://127.0.0.1:3001
```

The dashboard reads OpenBroker's audit database directly, so it works for any automation that uses the standard `openbroker auto run` runtime. No vault address, registry entry, webhook, or dashboard env vars are required.

### Dashboard Features

- automation list with running/stale/stopped status
- latest run metadata, script path, dry/live mode, PID, account metadata
- live account snapshots from the audit DB
- latest metrics emitted through `api.audit.metric`
- logs from the automation runtime
- audited client actions/orders/cancels
- fills, errors, and notes
- automatic browser refresh

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
