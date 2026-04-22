// ─────────────────────────────────────────────────────────────────────────
// Maehwa (매화) — Korean plum blossom, rendered in sumi ink and vermilion.
// Reusable decorative element. Stroke is ink, blossoms are vermilion.
// All coordinates hand-tuned from the Adobe Stock reference Max sent.
// ─────────────────────────────────────────────────────────────────────────

export function MaehwaBranch({
  className,
  seed = 0,
}: {
  className?: string;
  seed?: number;
}) {
  // `seed` nudges the branch geometry so we can drop several on a page
  // without them looking identical. Keep small to stay recognisable.
  const dx = seed * 6;

  return (
    <svg
      viewBox="0 0 400 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* main sumi branch — quick brushy curve */}
      <path
        d={`M${10 + dx} 240 C 60 200, 100 180, 150 160 S 260 120, 330 60`}
        stroke="#121110"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* secondary branch */}
      <path
        d={`M${150 + dx} 170 C 180 150, 210 155, 250 130`}
        stroke="#121110"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* twig */}
      <path
        d={`M${260 + dx} 100 C 275 85, 290 82, 305 72`}
        stroke="#2A2622"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* blossoms — 5-petal simplified */}
      {[
        { cx: 60, cy: 210, r: 7 },
        { cx: 110, cy: 180, r: 9 },
        { cx: 165, cy: 155, r: 8 },
        { cx: 220, cy: 130, r: 10 },
        { cx: 255, cy: 118, r: 7 },
        { cx: 295, cy: 80, r: 11 },
        { cx: 325, cy: 60, r: 9 },
      ].map((b, i) => (
        <g key={i} transform={`translate(${b.cx + dx} ${b.cy})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle
              key={a}
              cx={Math.cos((a * Math.PI) / 180) * b.r * 0.6}
              cy={Math.sin((a * Math.PI) / 180) * b.r * 0.6}
              r={b.r * 0.55}
              fill="#C8102E"
              opacity="0.92"
            />
          ))}
          {/* stamen center */}
          <circle r={1.6} fill="#7A0A1A" />
        </g>
      ))}
    </svg>
  );
}
