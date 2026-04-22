// ─────────────────────────────────────────────────────────────────────────
// Sparkline — dependency-free SVG chart for a 30d revenue strip.
//
// Renders a filled area + stroke on a normalised coord system. Server-safe
// (no useEffect). We don't draw axes — this is a read-at-a-glance signal.
// ─────────────────────────────────────────────────────────────────────────

export type SparklinePoint = {
  label: string; // YYYY-MM-DD
  value: number;
};

export function Sparkline({
  points,
  className = "",
  height = 80,
}: {
  points: SparklinePoint[];
  className?: string;
  height?: number;
}) {
  // Guard against empty data — still render a tidy baseline so the layout
  // doesn't collapse.
  if (points.length === 0) {
    return (
      <div
        className={className}
        style={{ height }}
        aria-label="No data"
      />
    );
  }

  const max = Math.max(...points.map((p) => p.value), 0);
  const min = 0;
  // Fixed viewBox — scales perfectly via SVG, no layout recalculation.
  const W = 400;
  const H = 100;
  const range = max - min || 1;

  const xStep = points.length > 1 ? W / (points.length - 1) : 0;
  const xs = points.map((_, i) => i * xStep);
  const ys = points.map((p) => H - ((p.value - min) / range) * H);

  const linePath = xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${ys[i].toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(2)} ${H} L0 ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={height}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label="30 day revenue trend"
    >
      {/* baseline */}
      <line
        x1={0}
        x2={W}
        y1={H - 0.5}
        y2={H - 0.5}
        stroke="currentColor"
        strokeOpacity={0.1}
      />
      <path d={areaPath} fill="currentColor" fillOpacity={0.08} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* end dot */}
      {xs.length > 0 && (
        <circle
          cx={xs[xs.length - 1]}
          cy={ys[ys.length - 1]}
          r={2.5}
          fill="currentColor"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
