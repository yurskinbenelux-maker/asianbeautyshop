// ─────────────────────────────────────────────────────────────────────────
// PdpTagRail — the small "good for / best for" row on the PDP header.
//
// Three stacks of quiet pills:
//   · Benefits      ("Brightening", "Hydrating")            — neutral ink
//   · Skin types    ("Dry", "Sensitive")                    — sage wash
//   · Concerns      ("Fine lines", "Dullness")              — vermilion wash
//
// Each pill links to the shop pre-filtered on that taxon, so the tags
// double as a soft navigation aid. The links are relative to the current
// locale via next-intl's <Link>.
//
// If all three groups are empty we render nothing — the section is an
// optional enhancement and shouldn't leave a gap on the page.
// ─────────────────────────────────────────────────────────────────────────

import { Link } from "@/i18n/routing";
import type { PdpBenefit, PdpTag } from "@/lib/queries/pdp";

type Props = {
  benefits: PdpBenefit[];
  skinTypes: PdpTag[];
  concerns: PdpTag[];
  labels: {
    benefits: string;    // "What it does"
    goodFor: string;     // "Good for"
    bestFor: string;     // "Best for"
  };
};

export function PdpTagRail({ benefits, skinTypes, concerns, labels }: Props) {
  const hasAny =
    benefits.length > 0 || skinTypes.length > 0 || concerns.length > 0;
  if (!hasAny) return null;

  return (
    <dl className="mt-6 flex flex-col gap-3 text-[12px] leading-relaxed">
      {benefits.length > 0 && (
        <Row label={labels.benefits}>
          {benefits.map((b) => (
            <PillLink key={b.id} href={`/shop?benefit=${b.slug}`} tone="neutral">
              {b.label}
            </PillLink>
          ))}
        </Row>
      )}
      {skinTypes.length > 0 && (
        <Row label={labels.goodFor}>
          {skinTypes.map((s) => (
            <PillLink
              key={s.slug}
              href={`/shop?skinType=${s.slug}`}
              tone="celadon"
            >
              {s.label}
            </PillLink>
          ))}
        </Row>
      )}
      {concerns.length > 0 && (
        <Row label={labels.bestFor}>
          {concerns.map((c) => (
            <PillLink
              key={c.slug}
              href={`/shop?concern=${c.slug}`}
              tone="vermilion"
            >
              {c.label}
            </PillLink>
          ))}
        </Row>
      )}
    </dl>
  );
}

// ── bits ────────────────────────────────────────────────────────────────

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <dt className="w-28 shrink-0 pt-1.5 text-[10px] uppercase tracking-label text-ink-mid">
        {label}
      </dt>
      <dd className="flex flex-wrap gap-1.5">{children}</dd>
    </div>
  );
}

function PillLink({
  href,
  children,
  tone,
}: {
  href: string;
  children: React.ReactNode;
  tone: "neutral" | "celadon" | "vermilion";
}) {
  const toneClass =
    tone === "celadon"
      ? "border-celadon/40 bg-celadon/10 text-ink hover:bg-celadon/20"
      : tone === "vermilion"
        ? "border-vermilion/20 bg-vermilion/5 text-vermilion-deep hover:bg-vermilion/10"
        : "border-ink/15 bg-white text-ink hover:bg-ink/5";

  return (
    <Link
      href={href}
      className={`inline-flex items-center border px-2.5 py-1 text-[11px] tracking-label transition-colors ${toneClass}`}
    >
      {children}
    </Link>
  );
}
