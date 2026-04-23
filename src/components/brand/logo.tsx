// ─────────────────────────────────────────────────────────────────────────
// Logo — the real YU.R wordmark, used in every surface that currently
// renders the brand visually.
//
// Two variants, each backed by its own real SVG asset:
//   lockup   → /brand/logo-lockup.svg
//              Full artwork, `yu·r` + "SKIN SOLUTION" tagline underneath.
//              Use where there's vertical space (footer, sign-in hero,
//              email headers rendered via PNG exports).
//   wordmark → /brand/favicon.svg
//              Just `yu·r`, no tagline. Tightly cropped so the letters
//              fill the frame — no wasted whitespace.
//              Use in tight contexts (nav, admin sidebar, favicons).
//
// Why two files instead of one cropped via CSS/viewBox:
//   The stretched `y` in this logo has an exceptionally long descender
//   that reaches DOWN to the same vertical zone where "SKIN SOLUTION"
//   sits horizontally (the tagline lives to the right of the descender,
//   not below it). A viewBox crop that hid the tagline would also clip
//   the bottom of the y. So the wordmark variant needs its own SVG with
//   the tagline paths actually removed — which favicon.svg already is.
//
// If Sofia ever redraws the logo, re-export both files together from
// the source .ai — keep them visually coherent.
// ─────────────────────────────────────────────────────────────────────────

type LogoVariant = "lockup" | "wordmark";

const SRC: Record<LogoVariant, string> = {
  lockup: "/brand/logo-lockup.svg",
  wordmark: "/brand/favicon.svg",
};

type LogoProps = {
  variant?: LogoVariant;
  /** CSS height value — number (px) or any CSS length. Width follows the
   *  natural aspect ratio of the variant's SVG. */
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
  const label = alt ?? (variant === "lockup" ? "YU.R Skin Solution" : "YU.R");
  const h = typeof height === "number" ? `${height}px` : height;

  return (
    // Next.js <Image> would force explicit width/height and kick off its
    // optimizer; for a ~3KB vector logo we just want a direct <img>.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC[variant]}
      alt={label}
      className={className}
      style={{
        height: h,
        width: "auto",
        display: "block",
        // Guard against parents forcing a width that would squash the mark.
        flexShrink: 0,
      }}
    />
  );
}
