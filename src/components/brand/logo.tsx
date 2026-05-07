// ─────────────────────────────────────────────────────────────────────────
// Logo — the Asian Beauty Shop mark, used wherever the brand renders
// visually. K'Elmus Group BV (legal entity) is identified separately
// in legal pages + invoices, never via this component.
//
// Two variants, each backed by its own real SVG asset:
//   lockup   → /brand/logo-lockup.svg
//              Full artwork — cherry-blossom branch above the
//              "ASIAN BEAUTY SHOP" wordmark. Use anywhere with vertical
//              breathing room: top nav (h48), footer (h72), sign-in,
//              no-access. Email shells render this via PNG exports
//              (see /brand/exports/email-logo.png).
//   wordmark → /brand/wordmark.svg
//              Just the "ASIAN / BEAUTY SHOP" wordmark, no branch.
//              Use only in tight horizontal slots where the lockup
//              would crush — currently just the admin sidebar (h28).
//
// favicon.svg is reserved for browser-tab + PWA contexts ONLY — it
// holds the icon-only mark (A + branch). Don't reach for it from
// here; use the wordmark variant for compact text contexts and the
// lockup for everything else.
//
// All three assets descend from the same source pair stored in
// public/brand/exports/ (lockup-source.svg + wordmark-source.svg +
// icon-source.svg). Re-export all three together if the brand mark
// is ever redrawn — keep them visually coherent.
// ─────────────────────────────────────────────────────────────────────────

type LogoVariant = "lockup" | "wordmark";

const SRC: Record<LogoVariant, string> = {
  lockup: "/brand/logo-lockup.svg",
  wordmark: "/brand/wordmark.svg",
};

type LogoProps = {
  variant?: LogoVariant;
  /** CSS height value — number (px) or any CSS length. Width follows the
   *  natural aspect ratio of the variant's SVG. */
  height?: number | string;
  /** Accessible label. Defaults to "Asian Beauty Shop"; pass explicit when needed. */
  alt?: string;
  className?: string;
};

export function Logo({
  variant = "lockup",
  height = 32,
  alt,
  className,
}: LogoProps) {
  const label = alt ?? "Asian Beauty Shop";
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
