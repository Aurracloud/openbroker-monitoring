import { useEffect, useMemo, useRef, useState } from 'react';
import { hl, type ClearinghouseState, type SpotClearinghouseState } from '../hyperliquid';
import { classNames, fmtNum, fmtPct, fmtRelative, fmtUsd } from '../util';

interface Props {
  user: string | null | undefined;
}

const REFRESH_MS = 6_000;

export function AccountStanding({ user }: Props) {
  const [perp, setPerp] = useState<ClearinghouseState | null>(null);
  const [spot, setSpot] = useState<SpotClearinghouseState | null>(null);
  const [mids, setMids] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user) {
      setPerp(null);
      setSpot(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const tick = async () => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setLoading(true);
      try {
        const [p, s, m] = await Promise.all([
          hl.clearinghouseState(user, 'mainnet', ctrl.signal),
          hl.spotState(user, 'mainnet', ctrl.signal),
          hl.allMids('mainnet', ctrl.signal).catch(() => ({} as Record<string, string>)),
        ]);
        if (cancelled) return;
        setPerp(p);
        setSpot(s);
        setMids(m);
        setUpdated(Date.now());
        setError(null);
      } catch (err) {
        if (cancelled || (err as { name?: string }).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    tick();
    const t = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
      ctrlRef.current?.abort();
    };
  }, [user]);

  const positions = perp?.assetPositions ?? [];
  const spotBalances = useMemo(
    () => (spot?.balances ?? []).filter((b) => Number(b.total) > 0),
    [spot],
  );

  const tokenMarkUsd = (coin: string): number => {
    if (coin === 'USDC' || /^USD[A-Z0-9]?$/.test(coin)) return 1;
    const px = Number(mids[coin]);
    return Number.isFinite(px) && px > 0 ? px : 0;
  };

  const summary = useMemo(() => {
    if (!perp) return null;
    const ms = perp.crossMarginSummary ?? perp.marginSummary;
    const perpEquity = Number(ms.accountValue);
    const ntl = Number(ms.totalNtlPos);
    const used = Number(ms.totalMarginUsed);
    const withdrawable = Number(perp.withdrawable);
    const maintenance = Number(perp.crossMaintenanceMarginUsed);

    // Spot valuation: hold portion is collateralizing perps and is already
    // counted inside perp.accountValue, so the unified-account "total" is
    // (spot free × mark) + perp.accountValue. Showing both halves so the
    // operator can see where the value lives.
    let spotTotalUsd = 0;
    let spotFreeUsd = 0;
    let spotHoldUsd = 0;
    let spotUpnlUsd = 0;
    for (const b of spotBalances) {
      const px = tokenMarkUsd(b.coin);
      const total = Number(b.total) * px;
      const hold = Number(b.hold) * px;
      spotTotalUsd += total;
      spotFreeUsd += total - hold;
      spotHoldUsd += hold;
      const entryNtl = Number(b.entryNtl);
      if (entryNtl > 0 && px > 0) {
        spotUpnlUsd += total - entryNtl;
      }
    }

    const totalValue = spotFreeUsd + perpEquity;
    const perpUpnl = positions.reduce((acc, ap) => acc + Number(ap.position.unrealizedPnl ?? 0), 0);
    const netUpnl = perpUpnl + spotUpnlUsd;
    // Hyperliquid reports cumFunding with the convention: positive = paid,
    // negative = received. Operators read "collected" as positive, so invert.
    const fundingCollected = positions.reduce(
      (acc, ap) => acc - Number(ap.position.cumFunding?.sinceOpen ?? 0),
      0,
    );
    // Margin ratio against unified total — matches what `openbroker account`
    // reports as marginRatio, and avoids the perp-only "95%" alarm when
    // there's plenty of headroom in spot.
    const marginRatio = totalValue > 0 ? (used / totalValue) * 100 : 0;
    // Maintenance ratio is the real liquidation indicator for perps.
    const maintRatio = perpEquity > 0 ? (maintenance / perpEquity) * 100 : 0;
    const leverage = perpEquity > 0 ? ntl / perpEquity : 0;

    return {
      perpEquity, ntl, used, withdrawable, maintenance,
      marginRatio, maintRatio, leverage,
      spotTotalUsd, spotFreeUsd, spotHoldUsd, spotUpnlUsd,
      totalValue, perpUpnl, netUpnl, fundingCollected,
    };
  }, [perp, spotBalances, mids]);

  if (!user) {
    return (
      <section className="panel account-panel">
        <PanelHead title="Account Standing" eyebrow="[L]" rhs="—" />
        <div className="empty">
          <span className="glyph">∅</span>
          no account address recorded for this run
        </div>
      </section>
    );
  }

  return (
    <section className="panel account-panel">
      <PanelHead
        title="Account Standing"
        eyebrow="[L]"
        rhs={
          error ? (
            <span style={{ color: 'var(--red)' }}>uplink err</span>
          ) : (
            <>
              <span className={`led ${loading ? 'warn' : 'live'}`} />
              <span>HL · {fmtRelative(updated)}</span>
            </>
          )
        }
      />

      {error ? (
        <div className="empty">
          <span className="glyph">!</span>
          {error}
        </div>
      ) : !summary ? (
        <div className="empty"><span className="glyph">∅</span>fetching…</div>
      ) : (
        <>
          <div className="acct-grid acct-grid-6">
            <Stat
              label="Total Value"
              value={fmtUsd(summary.totalValue)}
              tone="live"
              foot={
                <>
                  net uPnL{' '}
                  <strong className={classNames(summary.netUpnl > 0 && 'pos', summary.netUpnl < 0 && 'neg')}>
                    {summary.netUpnl >= 0 ? '+' : ''}{fmtUsd(summary.netUpnl)}
                  </strong>
                </>
              }
            />
            <Stat
              label="Spot"
              value={fmtUsd(summary.spotTotalUsd)}
              foot={
                <>
                  uPnL{' '}
                  <strong className={classNames(summary.spotUpnlUsd > 0 && 'pos', summary.spotUpnlUsd < 0 && 'neg')}>
                    {summary.spotUpnlUsd >= 0 ? '+' : ''}{fmtUsd(summary.spotUpnlUsd)}
                  </strong>
                  {' · hold '}<strong>{fmtUsd(summary.spotHoldUsd)}</strong>
                </>
              }
            />
            <Stat
              label="Perp Equity"
              value={fmtUsd(summary.perpEquity)}
              foot={
                <>
                  uPnL{' '}
                  <strong className={classNames(summary.perpUpnl > 0 && 'pos', summary.perpUpnl < 0 && 'neg')}>
                    {summary.perpUpnl >= 0 ? '+' : ''}{fmtUsd(summary.perpUpnl)}
                  </strong>
                  {' · lev '}<strong>{fmtNum(summary.leverage, 2)}x</strong>
                </>
              }
            />
            <Stat
              label="Funding Collected"
              value={fmtFunding(summary.fundingCollected)}
              tone={summary.fundingCollected > 0 ? 'live' : summary.fundingCollected < 0 ? 'bad' : undefined}
              foot="since position open · all perps"
            />
            <Stat
              label="Margin Used"
              value={fmtPct(summary.marginRatio, 1)}
              tone={summary.marginRatio > 80 ? 'bad' : summary.marginRatio > 60 ? 'warn' : undefined}
              foot={`${fmtUsd(summary.used)} of total · maint ${fmtPct(summary.maintRatio, 1)}`}
            />
            <Stat
              label="Withdrawable"
              value={fmtUsd(summary.withdrawable)}
              foot="cross-account free margin"
            />
          </div>

          <div className="acct-section">
            <div className="acct-section-head">
              <span>perp positions</span>
              <span className="dim">{positions.length}</span>
            </div>
            {positions.length === 0 ? (
              <div className="empty-soft">no open perp positions</div>
            ) : (
              <div className="table-wrap">
                <table className="data tight">
                  <thead>
                    <tr>
                      <th>Coin</th>
                      <th>Side</th>
                      <th className="num">Size</th>
                      <th className="num">Entry</th>
                      <th className="num">Mark</th>
                      <th className="num">Notional</th>
                      <th className="num">uPnL</th>
                      <th className="num">ROE</th>
                      <th className="num">Funding</th>
                      <th className="num">Liq</th>
                      <th>Lev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((ap) => {
                      const p = ap.position;
                      const szi = Number(p.szi);
                      const side = szi > 0 ? 'LONG' : szi < 0 ? 'SHORT' : 'FLAT';
                      const upnl = Number(p.unrealizedPnl);
                      const roe = Number(p.returnOnEquity) * 100;
                      const mark = Number(mids[p.coin] ?? 0);
                      // Invert sign so positive = received (collected) and
                      // negative = paid, matching how operators read funding.
                      const funding = -Number(p.cumFunding?.sinceOpen ?? 0);
                      return (
                        <tr key={p.coin}>
                          <td>{p.coin}</td>
                          <td className={szi > 0 ? 'pos' : szi < 0 ? 'neg' : ''}>{side}</td>
                          <td className="num">{fmtNum(Math.abs(szi), 6)}</td>
                          <td className="num">{p.entryPx ? fmtNum(p.entryPx, 6) : '—'}</td>
                          <td className="num">{mark ? fmtNum(mark, 6) : '—'}</td>
                          <td className="num">{fmtUsd(p.positionValue)}</td>
                          <td className={classNames('num', upnl > 0 && 'pos', upnl < 0 && 'neg')}>{fmtUsd(upnl)}</td>
                          <td className={classNames('num', roe > 0 && 'pos', roe < 0 && 'neg')}>{fmtPct(roe, 2)}</td>
                          <td className={classNames('num', funding > 0 && 'pos', funding < 0 && 'neg')}>{fmtFunding(funding)}</td>
                          <td className="num">{p.liquidationPx ? fmtNum(p.liquidationPx, 4) : '—'}</td>
                          <td className="small">{p.leverage.value}x · {p.leverage.type}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="acct-section">
            <div className="acct-section-head">
              <span>spot balances</span>
              <span className="dim">{spotBalances.length}</span>
            </div>
            {spotBalances.length === 0 ? (
              <div className="empty-soft">no non-zero spot balances</div>
            ) : (
              <div className="table-wrap">
                <table className="data tight">
                  <thead>
                    <tr>
                      <th>Coin</th>
                      <th className="num">Total</th>
                      <th className="num">Hold</th>
                      <th className="num">Free</th>
                      <th className="num">Mark</th>
                      <th className="num">Value</th>
                      <th className="num">Entry Notl</th>
                      <th className="num">uPnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spotBalances.map((b) => {
                      const total = Number(b.total);
                      const hold = Number(b.hold);
                      const entryNtl = Number(b.entryNtl);
                      const mark = tokenMarkUsd(b.coin);
                      const value = total * mark;
                      const upnl = entryNtl > 0 && mark > 0 ? value - entryNtl : null;
                      return (
                        <tr key={`${b.coin}-${b.token}`}>
                          <td>{b.coin}</td>
                          <td className="num">{fmtNum(total, 6)}</td>
                          <td className="num">{fmtNum(hold, 6)}</td>
                          <td className="num">{fmtNum(total - hold, 6)}</td>
                          <td className="num">{mark > 0 ? fmtNum(mark, 4) : '—'}</td>
                          <td className="num">{value > 0 ? fmtUsd(value) : '—'}</td>
                          <td className="num">{entryNtl ? fmtUsd(entryNtl) : '—'}</td>
                          <td className={classNames('num', upnl !== null && upnl > 0 && 'pos', upnl !== null && upnl < 0 && 'neg')}>
                            {upnl === null ? '—' : `${upnl >= 0 ? '+' : ''}${fmtUsd(upnl)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function fmtFunding(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
  return `${sign}$${abs}`;
}

function PanelHead({ title, eyebrow, rhs }: { title: string; eyebrow: string; rhs: React.ReactNode }) {
  return (
    <div className="panel-head">
      <div className="lhs">
        <span className="panel-eyebrow">{eyebrow}</span>
        <span className="panel-title">{title}</span>
      </div>
      <div className="panel-rhs">{rhs}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  foot,
  tone,
}: {
  label: string;
  value: string;
  foot?: React.ReactNode;
  tone?: 'live' | 'warn' | 'bad';
}) {
  return (
    <div className="acct-stat">
      <div className="acct-label">{label}</div>
      <div className={classNames('acct-value', tone)}>{value}</div>
      {foot ? <div className="acct-foot">{foot}</div> : null}
    </div>
  );
}
