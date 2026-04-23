// ─────────────────────────────────────────────────────────────────────────
// Logo — the real YU.R wordmark, used in every surface that currently
// renders the brand visually. Single source of truth: any copy change or
// replacement asset only needs to land at /public/brand/logo-lockup.svg.
//
// Two variants:
//   lockup   — full artwork, `yu·r` + "SKIN SOLUTION" tagline
//              Use where there's vertical space (footer, sign-in hero,
//              email headers rendered via PNG exports).
//   wordmark — just `yu·r`, no tagline, tightly cropped left/right too
//              Use in tight contexts (nav, admin sidebar, favicons) where
//              "SKIN SOLUTION" would render at <8px and the horizontal
//              artboard padding would leave the letters floating.
//
// Implementation — we don't maintain two SVG files. Both variants embed
// the same /brand/logo-lockup.svg via a host <svg> whose viewBox crops
// down to just the region we want. That way if Sofia ever swaps the
// logo, she replaces ONE file and both variants update immediately.
//
// Crop regions were measured from the source SVG's path transforms:
//   yu·r letter bounds ≈ x: 380–1210, y: 100–660 (padding added for safety)
//   tagline bounds      ≈ y: 700–760
// ─────────────────────────────────────────────────────────────────────────

type LogoVariant = "lockup" | "wordmark";

/**
 * Source SVG intrinsic dimensions — pulled from the file's viewBox.
 * Keep in sync with /public/brand/logo-lockup.svg.
 */
const SOURCE = {
  width: 1587.4,
  height: 1122.52,
} as const;

/**
 * ViewBox crops per variant. Values are in source-SVG coordinates.
 *   lockup   — full artwork, no crop
 *   wordmark — tight rectangle around just the `yu·r` letterforms,
 *              excluding the tagline and most of the artboard padding
 */
const VIEWBOX: Record<LogoVariant, { x: number; y: number; w: number; h: number }> = {
  lockup: { x: 0,   y: 0,   w: SOURCE.width, h: SOURCE.height },
  wordmark: { x: 360, y: 90, w: 870, h: 590 },
};

type LogoProps = {
  variant?: LogoVariant;
  /** CSS height value — number (px) or any CSS length. Width follows aspect. */
  height?: number | string;
  /** Accessible label. Defaults vary by variant; pass explicit when needed. */
  alt?: string;
  className?: string;
};

export function Logo({
  variant = "lockup",
  height = 32,
  alt,
  className,
}: LogoProps) {
  const box = VIEWBOX[variant];
  const label = alt ?? (variant === "lockup" ? "YU.R Skin Solution" : "YU.R");
  const h = typeof height === "number" ? `${height}px` : height;
  const aspectRatio = box.w / box.h;

  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{
        height: h,
        width: "auto",
        aspectRatio,
        display: "block",
        // Prevent weird squish if the parent forces a conflicting size —
        // aspectRatio + auto width derives from height reliably.
        flexShrink: 0,
      }}
    >
      {/* Embed the external SVG as-is. The host <svg>'s viewBox controls
          which portion of the source renders; the rest is cropped by the
          SVG spec naturally (no overflow:hidden needed). */}
      <image
        href="/brand/logo-lockup.svg"
        width={SOURCE.width}
        height={SOURCE.height}
        x={0}
        y={0}
      />
    </svg>
  );
}
