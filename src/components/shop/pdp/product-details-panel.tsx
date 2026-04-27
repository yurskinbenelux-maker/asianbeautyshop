// ─────────────────────────────────────────────────────────────────────────
// ProductDetailsPanel — the "Specifications" block on the PDP.
//
// Surfaces the supplier-spec fields that customers actually care about:
//   · Made in {country}      ← from Product.originCountry (ISO-3166)
//   · Shelf life             ← from Product.shelfLifeMonths
//   · Audience               ← from Product.audienceCategory enum
//   · Collection             ← from Product.productLine (e.g. "Yu.R PRO")
//
// Plus a small "Safety information" disclosure if ProductTranslation
// .warnings is set. Cosmetic regulatory bodies (EU 1223/2009, FDA-EU
// equivalents) require this block to be available; we render it as a
// quiet detail rather than a scary callout because most warnings are
// boilerplate ("Avoid contact with eyes").
//
// Self-hides if NO data is present — a product with none of these fields
// shouldn't render an empty section.
// ─────────────────────────────────────────────────────────────────────────

import { Globe2, Hourglass, Users, Tag, ShieldAlert } from "lucide-react";

type Labels = {
  eyebrow: string;          // "Product details"
  origin: string;           // "Made in"
  shelfLife: string;        // "Shelf life"
  shelfLifeUnit: string;    // "months"
  audience: string;         // "Audience"
  productLine: string;      // "Collection"
  safety: string;           // "Safety information"
};

type AudienceLabels = {
  UNISEX: string;
  WOMEN: string;
  MEN: string;
  KIDS: string;
  BABIES: string;
};

export function ProductDetailsPanel({
  originCountry,
  shelfLifeMonths,
  audienceCategory,
  productLine,
  warnings,
  /** BCP-47 locale string, used to render origin country in the user's language. */
  locale,
  labels,
  audienceLabels,
}: {
  originCountry: string | null;
  shelfLifeMonths: number | null;
  audienceCategory: string;
  productLine: string | null;
  warnings: string | null;
  locale: string;
  labels: Labels;
  audienceLabels: AudienceLabels;
}) {
  // Resolve ISO-3166 alpha-2 → human-readable country in the visitor's
  // locale ("KR" → "South Korea" in EN, "Corée du Sud" in FR, etc.).
  // Intl.DisplayNames is built into the runtime — no extra dep.
  const countryName = originCountry
    ? safeRegionName(originCountry, locale) ?? originCountry
    : null;

  // Audience ≠ UNISEX is the only audience worth surfacing — UNISEX is
  // the default and saying it explicitly clutters the panel for 90 % of
  // products. Shoppers expect "for women" etc. only when it's specific.
  const showAudience =
    audienceCategory && audienceCategory !== "UNISEX" && audienceCategory in audienceLabels;
  const audienceText = showAudience
    ? audienceLabels[audienceCategory as keyof AudienceLabels]
    : null;

  const hasAnySpec =
    countryName !== null ||
    shelfLifeMonths !== null ||
    audienceText !== null ||
    productLine !== null;

  if (!hasAnySpec && !warnings) return null;

  return (
    <section className="container mt-24 max-w-4xl">
      <div className="eyebrow">{labels.eyebrow}</div>

      {/* ── spec grid ─────────────────────────────────────────────── */}
      {hasAnySpec && (
        <dl className="mt-8 grid grid-cols-1 gap-px overflow-hidden border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-4">
          {countryName && (
            <SpecCell
              icon={Globe2}
              label={labels.origin}
              value={countryName}
            />
          )}
          {shelfLifeMonths !== null && (
            <SpecCell
              icon={Hourglass}
              label={labels.shelfLife}
              value={`${shelfLifeMonths} ${labels.shelfLifeUnit}`}
            />
          )}
          {audienceText && (
            <SpecCell
              icon={Users}
              label={labels.audience}
              value={audienceText}
            />
          )}
          {productLine && (
            <SpecCell
              icon={Tag}
              label={labels.productLine}
              value={productLine}
            />
          )}
        </dl>
      )}

      {/* ── safety disclosure ────────────────────────────────────── */}
      {warnings && (
        <div className="mt-10 flex gap-4 border border-ink/10 bg-rice-dim/40 p-6">
          <ShieldAlert
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-mid"
            aria-hidden
          />
          <div>
            <div className="eyebrow">{labels.safety}</div>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-mid">
              {warnings}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// ──────── atoms ───────────────────────────────────────────────────────────

function SpecCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 bg-rice p-5">
      <Icon
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-mid"
        aria-hidden
      />
      <div>
        <dt className="text-[10px] uppercase tracking-label text-ink-mid">
          {label}
        </dt>
        <dd className="mt-1 text-[14px] text-ink">{value}</dd>
      </div>
    </div>
  );
}

// ──────── helpers ─────────────────────────────────────────────────────────

/**
 * Convert ISO-3166 alpha-2 → display country name in the given locale.
 * Falls back to null on any failure (unknown code, runtime without ICU)
 * so the caller can decide how to render the missing piece.
 */
function safeRegionName(iso2: string, locale: string): string | null {
  try {
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    const name = dn.of(iso2.toUpperCase());
    // Intl returns the input back when it can't resolve — treat that
    // as "didn't work" so the caller falls back to the raw code.
    if (!name || name.toUpperCase() === iso2.toUpperCase()) return null;
    return name;
  } catch {
    return null;
  }
}
