// ─────────────────────────────────────────────────────────────────────────
// Bestsellers — section wrapper on the homepage.
//
// Server component: fetches real products from Supabase via Prisma, then
// hands each one to <BestsellerCard /> (a client component that animates).
//
// We fetch up to 4 so the desktop row can pack 4 products without
// scrolling. The query returns whatever an admin has flagged — fewer than
// 4 is fine, the grid just renders what's there. Mobile shows 2-up
// regardless (see grid classes below).
// ─────────────────────────────────────────────────────────────────────────

import { Link } from "@/i18n/routing";
import { getBestsellers } from "@/lib/queries/products";
import { BestsellerCard } from "./bestseller-card";

// Section copy is resolved on the server in app/[locale]/page.tsx — SiteCopy
// override ?? section messages. We just render what arrives.
export type BestsellersCopy = {
  eyebrow: string;
  lede: string;
};

export async function Bestsellers({
  locale,
  copy,
}: {
  locale: string;
  copy: BestsellersCopy;
}) {
  const products = await getBestsellers(locale, 4);

  // Graceful empty state (only shows before the DB is seeded)
  if (products.length === 0) {
    return (
      <section className="container py-32">
        {copy.eyebrow ? <div className="eyebrow">{copy.eyebrow}</div> : null}
        {copy.lede ? (
          <h2 className="mt-3 max-w-[22ch] text-display-md">{copy.lede}</h2>
        ) : null}
        <p className="mt-8 text-ink-mid">
          {/* Intentionally plain — an admin never sees this in production. */}
          No bestsellers yet.
        </p>
      </section>
    );
  }

  return (
    <section className="container py-32">
      {/* ── section header ───────────────────────────────────── */}
      <div className="mb-16 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          {/* Both lines are conditional so a voided field (siteCopyOr → "")
              doesn't leave an empty wrapper occupying space. */}
          {copy.eyebrow ? <div className="eyebrow">{copy.eyebrow}</div> : null}
          {copy.lede ? (
            <h2 className="mt-3 max-w-[22ch] text-display-md">{copy.lede}</h2>
          ) : null}
        </div>
        <Link
          href="/shop"
          className="text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 transition-colors hover:text-vermilion"
        >
          See all →
        </Link>
      </div>

      {/* ── product grid ─────────────────────────────────────── */}
      {/* 2-up on phones, 4-up on desktop. The query fetches up to 4
          bestsellers so all of them fit on one row at md+ without
          horizontal scroll. Tighter gap on mobile so 2 cols breathe;
          desktop gets the full editorial gap-8. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 md:gap-8">
        {products.map((p, i) => (
          <BestsellerCard key={p.id} product={p} index={i} locale={locale} />
        ))}
      </div>
    </section>
  );
}
