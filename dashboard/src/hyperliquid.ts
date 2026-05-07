// Direct browser → Hyperliquid info endpoint client.
// CORS is open (`access-control-allow-origin: *`) so we don't need a proxy.

const MAINNET = 'https://api.hyperliquid.xyz/info';
const TESTNET = 'https://api.hyperliquid-testnet.xyz/info';

export interface MarginSummary {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
}

export interface PerpPosition {
  coin: string;
  szi: string;
  entryPx?: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  marginUsed: string;
  maxLeverage: number;
  leverage: { type: string; value: number };
  cumFunding?: { allTime: string; sinceOpen: string; sinceChange: string };
}

export interface ClearinghouseState {
  marginSummary: MarginSummary;
  crossMarginSummary: MarginSummary;
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
  assetPositions: { type: string; position: PerpPosition }[];
  time: number;
}

export interface SpotBalance {
  coin: string;
  token: number;
  total: string;
  hold: string;
  entryNtl: string;
}

export interface SpotClearinghouseState {
  balances: SpotBalance[];
}

async function info<T>(network: 'mainnet' | 'testnet', body: object, signal?: AbortSignal): Promise<T> {
  const url = network === 'testnet' ? TESTNET : MAINNET;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`hyperliquid ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const hl = {
  clearinghouseState: (user: string, network: 'mainnet' | 'testnet' = 'mainnet', signal?: AbortSignal) =>
    info<ClearinghouseState>(network, { type: 'clearinghouseState', user: user.toLowerCase() }, signal),
  spotState: (user: string, network: 'mainnet' | 'testnet' = 'mainnet', signal?: AbortSignal) =>
    info<SpotClearinghouseState>(network, { type: 'spotClearinghouseState', user: user.toLowerCase() }, signal),
  allMids: (network: 'mainnet' | 'testnet' = 'mainnet', signal?: AbortSignal) =>
    info<Record<string, string>>(network, { type: 'allMids' }, signal),
};
