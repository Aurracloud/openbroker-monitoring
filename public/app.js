const $ = (selector) => document.querySelector(selector);

const state = {
  automations: [],
  selectedRunId: null,
  selectedAutomationId: null,
  run: null,
  logs: [],
  metrics: [],
  snapshots: [],
  actions: [],
  fills: [],
  notes: [],
  errors: [],
  tab: "logs",
  lastRefresh: null,
};

function fmtTime(ts) {
  if (!ts) return "-";
  return new Date(Number(ts)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDateTime(ts) {
  if (!ts) return "-";
  return new Date(Number(ts)).toLocaleString();
}

function fmtUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtNum(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function statusClass(status) {
  if (status === "running") return "good";
  if (status === "stale") return "warn";
  if (status === "error") return "bad";
  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function latestMetric(name) {
  return state.run?.latestMetrics?.find((m) => m.name === name)?.value;
}

function metricRows() {
  const metrics = state.run?.latestMetrics ?? [];
  if (!metrics.length) return `<div class="empty">No metrics yet</div>`;
  return `
    <table class="table">
      <thead><tr><th>Name</th><th>Value</th><th>Tags</th></tr></thead>
      <tbody>
        ${metrics.map((m) => `
          <tr>
            <td class="mono">${escapeHtml(m.name)}</td>
            <td>${fmtNum(m.value, 6)}</td>
            <td class="mono">${escapeHtml(JSON.stringify(m.tags ?? {}))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function sparkline(points, key) {
  const values = points
    .slice()
    .reverse()
    .map((p) => Number(p[key]))
    .filter(Number.isFinite);
  if (values.length < 2) {
    return `<div class="empty">Not enough snapshot data yet</div>`;
  }
  const width = 640;
  const height = 180;
  const pad = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => {
    const x = pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return `
    <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${key} chart">
      <path d="${d}" fill="none" stroke="#3268d8" stroke-width="3" />
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#dfe6e4" />
      <text x="${pad}" y="18" fill="#657173" font-size="12">${escapeHtml(key)} ${fmtNum(values.at(-1), 2)}</text>
    </svg>
  `;
}

function renderAutomations() {
  const list = state.automations;
  if (!list.length) return `<div class="empty">No automation runs found yet</div>`;
  return list.map((a) => {
    const active = a.runId === state.selectedRunId ? " active" : "";
    const snap = a.latestSnapshot;
    return `
      <button class="auto-row${active}" data-run="${escapeHtml(a.runId)}" data-auto="${escapeHtml(a.automationId)}">
        <div>
          <div class="auto-title">${escapeHtml(a.automationId)}</div>
          <div class="auto-meta">
            <span class="badge ${statusClass(a.status)}">${escapeHtml(a.status)}</span>
            <span class="badge">${a.dryRun ? "dry" : "live"}</span>
            <span class="badge">pid ${escapeHtml(a.pid)}</span>
          </div>
          <p class="subtle mono" title="${escapeHtml(a.scriptPath)}">${escapeHtml((a.scriptPath ?? "").split("/").slice(-2).join("/"))}</p>
        </div>
        <div class="subtle">${fmtTime(snap?.timestamp ?? a.startedAt)}</div>
      </button>
    `;
  }).join("");
}

function renderStats() {
  const snap = state.run?.latestSnapshot;
  const funding = latestMetric("funding_annualized_pct");
  const target = latestMetric("target_carry_usd");
  const shortUsd = latestMetric("short_usd");
  const spotUsd = latestMetric("spot_usd");
  return `
    <div class="grid stats">
      <div class="panel stat">
        <div class="stat-label">Equity</div>
        <div class="stat-value">${fmtUsd(snap?.equity)}</div>
        <div class="stat-foot">margin ${fmtNum(snap?.marginUsedPct)}%</div>
      </div>
      <div class="panel stat">
        <div class="stat-label">Funding APR</div>
        <div class="stat-value">${funding === undefined ? "-" : `${fmtNum(funding)}%`}</div>
        <div class="stat-foot">latest automation metric</div>
      </div>
      <div class="panel stat">
        <div class="stat-label">Target</div>
        <div class="stat-value">${fmtUsd(target)}</div>
        <div class="stat-foot">current desired notional</div>
      </div>
      <div class="panel stat">
        <div class="stat-label">Carry Legs</div>
        <div class="stat-value">${fmtUsd(shortUsd)}</div>
        <div class="stat-foot">spot ${fmtUsd(spotUsd)}</div>
      </div>
    </div>
  `;
}

function renderTabContent() {
  if (!state.run) return `<div class="empty">Select an automation</div>`;
  if (state.tab === "logs") {
    if (!state.logs.length) return `<div class="empty">No logs yet</div>`;
    return `<div class="log-list">${state.logs.map((l) => `
      <div class="log-line">
        <span class="subtle">${fmtTime(l.timestamp)}</span>
        <span class="log-level ${escapeHtml(l.level)}">${escapeHtml(l.level)}</span>
        <span class="log-message">${escapeHtml(l.message)}</span>
      </div>
    `).join("")}</div>`;
  }
  if (state.tab === "actions") {
    const rows = state.actions;
    if (!rows.length) return `<div class="empty">No audited actions yet</div>`;
    return `
      <table class="table">
        <thead><tr><th>Time</th><th>Method</th><th>Phase</th><th>Dry</th></tr></thead>
        <tbody>${rows.map((a) => `
          <tr><td>${fmtTime(a.timestamp)}</td><td class="mono">${escapeHtml(a.method)}</td><td>${escapeHtml(a.phase)}</td><td>${a.dryRun ? "yes" : "no"}</td></tr>
        `).join("")}</tbody>
      </table>
    `;
  }
  if (state.tab === "fills") {
    const rows = state.fills;
    if (!rows.length) return `<div class="empty">No fills yet</div>`;
    return `
      <table class="table">
        <thead><tr><th>Time</th><th>Coin</th><th>Side</th><th>Size</th><th>Price</th><th>Fee</th></tr></thead>
        <tbody>${rows.map((f) => `
          <tr>
            <td>${fmtTime(f.timestamp)}</td><td class="mono">${escapeHtml(f.coin)}</td><td>${escapeHtml(f.side)}</td>
            <td>${fmtNum(f.size, 6)}</td><td>${fmtNum(f.price, 6)}</td><td>${fmtUsd(f.fee)}</td>
          </tr>
        `).join("")}</tbody>
      </table>
    `;
  }
  if (state.tab === "errors") {
    const rows = state.errors;
    if (!rows.length) return `<div class="empty">No errors recorded</div>`;
    return `
      <table class="table">
        <thead><tr><th>Time</th><th>Stage</th><th>Error</th></tr></thead>
        <tbody>${rows.map((e) => `
          <tr><td>${fmtTime(e.timestamp)}</td><td>${escapeHtml(e.stage)}</td><td class="mono">${escapeHtml(JSON.stringify(e.error))}</td></tr>
        `).join("")}</tbody>
      </table>
    `;
  }
  return metricRows();
}

function render() {
  const selected = state.run;
  $("#app").innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="mark">OB</div>
          <div>
            <h1>OpenBroker Monitor</h1>
            <p class="subtle">Local automation telemetry from the OpenBroker audit database</p>
          </div>
        </div>
        <div class="toolbar">
          <span class="badge ${selected?.status === "running" ? "good" : ""}">${selected ? escapeHtml(selected.status) : "idle"}</span>
          <span class="subtle">Updated ${state.lastRefresh ? fmtTime(state.lastRefresh) : "-"}</span>
          <button class="icon-btn" title="Refresh" data-refresh>↻</button>
        </div>
      </header>

      <div class="layout">
        <aside class="sidebar panel">
          <div class="panel-header">
            <h2>Automations</h2>
            <span class="badge">${state.automations.length}</span>
          </div>
          <div class="auto-list">${renderAutomations()}</div>
        </aside>

        <main class="main grid">
          ${selected ? `
            <section class="panel">
              <div class="panel-header">
                <div>
                  <h2>${escapeHtml(selected.automationId)}</h2>
                  <p class="subtle mono">${escapeHtml(selected.runId)}</p>
                </div>
                <div class="toolbar">
                  <span class="badge ${statusClass(selected.status)}">${escapeHtml(selected.status)}</span>
                  <span class="badge">${selected.dryRun ? "dry run" : "live"}</span>
                </div>
              </div>
            </section>
            ${renderStats()}
            <section class="grid split">
              <div class="panel">
                <div class="panel-header"><h2>Equity</h2><span class="subtle">${fmtDateTime(selected.latestSnapshot?.timestamp)}</span></div>
                ${sparkline(state.snapshots, "equity")}
              </div>
              <div class="panel">
                <div class="panel-header"><h2>Latest Metrics</h2></div>
                ${metricRows()}
              </div>
            </section>
            <section class="panel">
              <div class="panel-header">
                <h2>Timeline</h2>
                <div class="tabs">
                  ${["logs", "actions", "fills", "metrics", "errors"].map((tab) => `
                    <button class="tab ${state.tab === tab ? "active" : ""}" data-tab="${tab}">${tab}</button>
                  `).join("")}
                </div>
              </div>
              ${renderTabContent()}
            </section>
          ` : `<section class="panel"><div class="empty">Waiting for an automation run</div></section>`}
        </main>
      </div>
    </div>
  `;

  document.querySelectorAll("[data-run]").forEach((el) => {
    el.addEventListener("click", () => selectRun(el.dataset.auto, el.dataset.run));
  });
  document.querySelectorAll("[data-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      state.tab = el.dataset.tab;
      render();
    });
  });
  $("[data-refresh]")?.addEventListener("click", () => refresh(true));
}

async function selectRun(automationId, runId) {
  state.selectedAutomationId = automationId;
  state.selectedRunId = runId;
  await loadRun();
  render();
}

async function loadRun() {
  if (!state.selectedRunId) return;
  const runId = encodeURIComponent(state.selectedRunId);
  const [run, logs, metrics, snapshots, actions, fills, notes, errors] = await Promise.all([
    getJson(`/api/runs/${runId}`),
    getJson(`/api/runs/${runId}/logs?limit=100`),
    getJson(`/api/runs/${runId}/metrics?limit=250`),
    getJson(`/api/runs/${runId}/snapshots?limit=80`),
    getJson(`/api/runs/${runId}/actions?limit=80`),
    getJson(`/api/runs/${runId}/fills?limit=80`),
    getJson(`/api/runs/${runId}/notes?limit=80`),
    getJson(`/api/runs/${runId}/errors?limit=80`),
  ]);
  Object.assign(state, { run, logs, metrics, snapshots, actions, fills, notes, errors });
}

async function refresh(keepSelection = false) {
  try {
    state.automations = await getJson("/api/automations");
    if (!keepSelection || !state.selectedRunId || !state.automations.some((a) => a.runId === state.selectedRunId)) {
      const first = state.automations[0];
      state.selectedAutomationId = first?.automationId ?? null;
      state.selectedRunId = first?.runId ?? null;
    }
    await loadRun();
    state.lastRefresh = Date.now();
    render();
  } catch (error) {
    $("#app").innerHTML = `
      <div class="shell">
        <header class="topbar"><div class="brand"><div class="mark">OB</div><h1>OpenBroker Monitor</h1></div></header>
        <main class="layout"><section class="panel"><div class="empty">Failed to load dashboard: ${escapeHtml(error.message)}</div></section></main>
      </div>
    `;
  }
}

refresh();
setInterval(() => refresh(true), 3000);
