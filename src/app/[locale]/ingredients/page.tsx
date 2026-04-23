// ─────────────────────────────────────────────────────────────────────────
// /[locale]/ingredients — alphabetised index of every ingredient in the
// catalogue, with a separate "Key actives" lane up top.
//
// Why two lanes:
//   · Key actives (flagged `isKeyAsset` in the Ingredient model) are the
//     hero ingredients Sofia wants to showcase — Centella, Niacinamide,
//     Propolis, etc. They get slightly bigger cards + a short blurb.
//   · Everything else lives in an A-Z grouping further down, for
//     shoppers doing INCI diligence.
//
// Empty-state is handled gracefully: if there are no ingredients in the
// DB yet, we show a friendly placeholder instead of a blank grid. Sofia
// populates via /admin/products by adding ingredients per product — the
// IngredientAdmin CRUD will be a future task if she wants a dedicated
// editor.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";

import { Link } from "@/i18n/routing";
import { listActiveIngredients } from "@/lib/queries/ingredients";
import { buildPageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ingredients" });
  return {
    ...buildPageMetadata({
      locale,
      tail: "/ingredients",
      title: t("meta_title"),
      description: t("meta_description"),
    }),
    robots: { index: true, follow: true },
  };
}

export default async function IngredientsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("ingredients");
  const rows = await listActiveIngredients(locale);

  // Split into key actives + the rest. The rest are grouped by first
  // letter of the display name so we can render an A-Z index.
  const keyActives = rows.filter((r) => r.isKeyAsset);
  const others = rows.filter((r) => !r.isKeyAsset);

  const grouped = groupByInitial(others);
  const letters = Array.from(grouped.keys()).sort();

  return (
    <article className="container max-w-5xl py-16 md:py-24">
      {/* ── masthead ─────────────────────────────────────────────── */}
      <header className="mx-auto max-w-2xl text-center">
        <div className="eyebrow">{t("eyebrow")}</div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {t("title")}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-mid">
          {t("lede")}
        </p>
      </header>

      <div className="rule my-16" />

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* ── key actives ─────────────────────────────────────── */}
          {keyActives.length > 0 && (
            <section className="mb-20" aria-labelledby="key-actives-heading">
              <div className="mb-8 flex items-center gap-3">
                <Sparkles
                  className="h-4 w-4 text-vermilion"
                  aria-hidden
                />
                <h2
                  id="key-actives-heading"
                  className="text-[11px] uppercase tracking-label text-ink-mid"
                >
                  {t("key_heading")}
                </h2>
              </div>
              <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {keyActives.map((ing) => (
                  <li key={ing.slug}>
                    <KeyActiveCard ing={ing} productsLabel={t("product_count", { count: ing.productCount })} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── A-Z listing ─────────────────────────────────────── */}
          {others.length > 0 && (
            <section aria-labelledby="az-heading">
              <div className="mb-8 flex items-center justify-between gap-4">
                <h2
                  id="az-heading"
                  className="text-[11px] uppercase tracking-label text-ink-mid"
                >
                  {t("all_heading")}
                </h2>

                {/* A-Z jump bar (desktop only — mobile can scroll) */}
                {letters.length > 1 && (
                  <nav
                    aria-label={t("az_nav")}
                    className="hidden flex-wrap gap-x-2 text-[11px] uppercase tracking-label text-ink-mid md:flex"
                  >
                    {letters.map((L) => (
                      <a
                        key={L}
                        href={`#letter-${L}`}
                        className="transition-colors hover:text-vermilion"
                      >
                        {L}
                      </a>
                    ))}
                  </nav>
                )}
              </div>

              <div className="space-y-12">
                {letters.map((L) => (
                  <section key={L} id={`letter-${L}`} className="scroll-mt-24">
                    <div className="mb-5 flex items-baseline gap-4 border-b border-ink/10 pb-3">
                      <div className="font-display text-[32px] leading-none text-ink">
                        {L}
                      </div>
                      <div className="text-[11px] uppercase tracking-label text-ink-mid">
                        {(grouped.get(L) ?? []).length}
                      </div>
                    </div>
                    <ul className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
                      {(grouped.get(L) ?? []).map((ing) => (
                        <li key={ing.slug}>
                          <Link
                            href={`/ingredients/${ing.slug}`}
                            className="flex items-baseline justify-between gap-6 border-b border-ink/5 py-2 transition-colors hover:text-vermilion"
                          >
                            <span className="font-display text-[16px] text-ink group-hover:text-vermilion">
                              {ing.displayName}
                            </span>
                            <span className="shrink-0 text-[11px] uppercase tracking-label text-ink-mid">
                              {t("product_count_short", { count: ing.productCount })}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers + sub-components
// ─────────────────────────────────────────────────────────────────────

function groupByInitial<T extends { displayName: string }>(
  items: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const letter = (item.displayName[0] ?? "·").toUpperCase();
    const bucket = map.get(letter) ?? [];
    bucket.push(item);
    map.set(letter, bucket);
  }
  // Sort each bucket alphabetically for deterministic output.
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return map;
}

function KeyActiveCard({
  ing,
  productsLabel,
}: {
  ing: {
    slug: string;
    displayName: string;
    inciName: string;
    shortDescription: string | null;
  };
  productsLabel: string;
}) {
  return (
    <Link
      href={`/ingredients/${ing.slug}`}
      className="group block h-full border border-ink/10 bg-white/60 p-6 transition-colors hover:border-vermilion/40 hover:bg-vermilion/5"
    >
      <div className="font-display text-[22px] leading-tight text-ink">
        {ing.displayName}
      </div>
      {ing.inciName !== ing.displayName && (
        <div className="mt-1 text-[11px] uppercase tracking-label text-ink-mid">
          {ing.inciName}
        </div>
      )}
      {ing.shortDescription && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-mid">
          {ing.shortDescription}
        </p>
      )}
      <div className="mt-6 flex items-center justify-between text-[11px] uppercase tracking-label text-ink-mid">
        <span>{productsLabel}</span>
        <span className="text-ink transition-colors group-hover:text-vermilion">
          →
        </span>
      </div>
    </Link>
  );
}

async function EmptyState() {
  const t = await getTranslations("ingredients");
  return (
    <div className="border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-ink-mid" aria-hidden />
      <h2 className="mt-4 font-display text-[22px] text-ink">
        {t("empty_title")}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
        {t("empty_body")}
      </p>
      <Link
        href="/shop"
        className="mt-6 inline-flex items-center gap-2 border border-ink bg-ink px-5 py-3 text-[12px] uppercase tracking-label text-rice hover:bg-vermilion hover:border-vermilion transition-colors"
      >
        {t("empty_cta")}
      </Link>
    </div>
  );
}
