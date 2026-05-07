interface Props {
  values: number[];
  width?: number;
  height?: number;
  ariaLabel?: string;
  showArea?: boolean;
}

export function Sparkline({ values, width = 120, height = 32, ariaLabel = 'sparkline', showArea = true }: Props) {
  const cleaned = values.filter(Number.isFinite);
  if (cleaned.length < 2) {
    return (
      <svg className="spark" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke="var(--border-strong)" strokeWidth={1} />
      </svg>
    );
  }
  const min = Math.min(...cleaned);
  const max = Math.max(...cleaned);
  const span = max - min || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const pts = cleaned.map((v, i) => {
    const x = pad + (i / (cleaned.length - 1)) * innerW;
    const y = pad + innerH - ((v - min) / span) * innerH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const path = `M${pts.join(' L')}`;
  const areaPath = `${path} L${(pad + innerW).toFixed(2)},${(pad + innerH).toFixed(2)} L${pad.toFixed(2)},${(pad + innerH).toFixed(2)} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
      {showArea && <path className="area" d={areaPath} />}
      <path className="line" d={path} />
    </svg>
  );
}
