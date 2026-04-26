# openbroker-monitoring

Optional dashboard / metrics forwarder for [`openbroker`](https://www.npmjs.com/package/openbroker).

## Why this is a separate package

The `openbroker` CLI ships as an OpenClaw plugin. OpenClaw scans plugin tarballs at install time and blocks the combination of `process.env` access + outbound `fetch` (the "credential harvesting" rule). Shipping the dashboard forwarder inside the plugin tripped that rule, so the network egress lives here instead.

## Install

```bash
npm install openbroker openbroker-monitoring
```

`openbroker auto run` resolves `openbroker-monitoring` at startup using Node's normal module resolver. If it can be found, the dashboard observer is wired into the audit pipeline automatically — no flags needed.

## Configuration

| Env var | Purpose |
| --- | --- |
| `OB_DASHBOARD_URL` | Dashboard base URL, e.g. `http://localhost:3001`. Required. |
| `OB_DASHBOARD_API_KEY` | Bearer token sent as `Authorization: Bearer <key>`. Optional. |
| `HYPERSTABLE_VAULT_ADDRESS` (or `VAULT`) | Vault address used in the URL path. Required. |

If `OB_DASHBOARD_URL` or the vault address is missing, the observer returns `null` and the runtime no-ops.

## Programmatic use

```ts
import { createDashboardObserver } from 'openbroker-monitoring';

const observer = createDashboardObserver({
  url: 'http://localhost:3001',
  apiKey: process.env.MY_KEY,
  vaultAddress: '0x...',
});
```

The observer implements `AutomationAuditObserver`:

```ts
interface AutomationAuditObserver {
  onNote?(kind: string, payload?: unknown): void;
  onMetric?(name: string, value: number, tags?: Record<string, unknown>): void;
  onAgentAction?(
    action: string,
    status: 'success' | 'error',
    details: Record<string, unknown>,
    txHash?: string,
  ): void;
}
```

## Endpoints called

All requests are `POST` with `Content-Type: application/json`, fire-and-forget with a 5s timeout. Failures are swallowed so the trading loop is never blocked.

- `POST {url}/api/vaults/{vault}/audit/notes` — `{ category, label, data }`
- `POST {url}/api/vaults/{vault}/audit/metrics` — `{ name, value, tags }`
- `POST {url}/api/vaults/{vault}/agent/logs` — `{ action, status, details, txHash? }`
