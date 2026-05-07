import { useMemo, useState } from 'react';
import { fmtTime } from '../util';

interface Props {
  points: { timestamp: number; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
  accent?: string;
}

export function Chart({ points, height = 220, formatValue = (v) => String(v), accent = 'live' }: Props) {
  const [hover, setHover] = useState<{ x: number; y: number; idx: number } | null>(null);

  const data = useMemo(
    () =>
      points
        .filter((p) => Number.isFinite(p.value) && Number.isFinite(p.timestamp))
        .sort((a, b) => a.timestamp - b.timestamp),
    [points],
  );

  if (data.length < 2) {
    return (
      <div className="empty">
        <span className="glyph">∅</span>
        Awaiting telemetry
      </div>
    );
  }

  const width = 1000;
  const padL = 56;
  const padR = 24;
  const padT = 18;
  const padB = 30;

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const min = Math.min(...data.map((p) => p.value));
  const max = Math.max(...data.map((p) => p.value));
  const span = max - min || max || 1;
  const yMin = min - span * 0.08;
  const yMax = max + span * 0.08;
  const ySpan = yMax - yMin || 1;

  const t0 = data[0].timestamp;
  const tN = data[data.length - 1].timestamp;
  const tSpan = Math.max(1, tN - t0);

  const x = (ts: number) => padL + ((ts - t0) / tSpan) * innerW;
  const y = (v: number) => padT + innerH - ((v - yMin) / ySpan) * innerH;

  const pathPts = data.map((p) => `${x(p.timestamp).toFixed(2)},${y(p.value).toFixed(2)}`);
  const linePath = `M${pathPts.join(' L')}`;
  const areaPath = `${linePath} L${(padL + innerW).toFixed(2)},${(padT + innerH).toFixed(2)} L${padL.toFixed(2)},${(padT + innerH).toFixed(2)} Z`;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (ySpan * i) / yTicks);

  const xTicks = 5;
  const xTickValues = Array.from({ length: xTicks + 1 }, (_, i) => t0 + (tSpan * i) / xTicks);

  const last = data[data.length - 1];
  const cx = x(last.timestamp);
  const cy = y(last.value);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    if (px < padL || px > padL + innerW) {
      setHover(null);
      return;
    }
    const t = t0 + ((px - padL) / innerW) * tSpan;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(data[i].timestamp - t);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const p = data[bestIdx];
    setHover({ x: x(p.timestamp), y: y(p.value), idx: bestIdx });
  };

  const hoverPoint = hover ? data[hover.idx] : null;

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id="grad-live" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={`var(--${accent})`} stopOpacity="0.35" />
          <stop offset="100%" stopColor={`var(--${accent})`} stopOpacity="0" />
        </linearGradient>
      </defs>

      {tickValues.map((v, i) => (
        <g key={`yt-${i}`}>
          <line className="grid" x1={padL} x2={padL + innerW} y1={y(v)} y2={y(v)} />
          <text className="label" x={padL - 10} y={y(v) + 4} textAnchor="end">
            {formatValue(v)}
          </text>
        </g>
      ))}

      {xTickValues.map((t, i) => (
        <text key={`xt-${i}`} className="label" x={x(t)} y={padT + innerH + 18} textAnchor="middle">
          {fmtTime(t)}
        </text>
      ))}

      <line className="axis" x1={padL} x2={padL + innerW} y1={padT + innerH} y2={padT + innerH} />

      <path className="area" d={areaPath} />
      <path className="line" d={linePath} />

      <circle className="marker" cx={cx} cy={cy} r={4} />
      <text
        className="label"
        x={cx + 8}
        y={cy - 8}
        fill="var(--fg)"
        style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 0 }}
      >
        {formatValue(last.value)}
      </text>

      {hoverPoint && (
        <g>
          <line className="grid" x1={hover!.x} x2={hover!.x} y1={padT} y2={padT + innerH} stroke="var(--live)" strokeDasharray="2 3" opacity="0.6" />
          <circle cx={hover!.x} cy={hover!.y} r={3.5} fill="var(--live)" />
          <g transform={`translate(${Math.min(hover!.x + 10, padL + innerW - 160)}, ${Math.max(padT, hover!.y - 32)})`}>
            <rect width={150} height={28} fill="var(--bg)" stroke="var(--border-hot)" strokeWidth={1} />
            <text x={8} y={12} fill="var(--muted)" style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.16em' }}>
              {fmtTime(hoverPoint.timestamp).toUpperCase()}
            </text>
            <text x={8} y={23} fill="var(--fg)" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
              {formatValue(hoverPoint.value)}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}
