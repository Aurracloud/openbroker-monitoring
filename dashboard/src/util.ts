export function fmtTime(ts?: number | null): string {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function fmtDate(ts?: number | null): string {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium', hour12: false });
}

export function fmtRelative(ts?: number | null, now = Date.now()): string {
  if (!ts) return '—';
  const diff = Math.max(0, now - Number(ts));
  if (diff < 1_000) return 'just now';
  const s = Math.floor(diff / 1_000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function fmtNum(value: number | string | undefined | null, digits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtUsd(value: number | string | undefined | null, digits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

export function fmtPct(value: number | string | undefined | null, digits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

export function shortAddr(addr?: string | null): string {
  if (!addr || typeof addr !== 'string') return '—';
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function shortRunId(runId?: string | null): string {
  if (!runId) return '—';
  return runId.split('-')[0] ?? runId.slice(0, 8);
}

export function bytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function statusColor(status: string): 'live' | 'warn' | 'bad' | 'idle' {
  if (status === 'running') return 'live';
  if (status === 'stale' || status === 'unknown') return 'warn';
  if (status === 'error') return 'bad';
  return 'idle';
}
