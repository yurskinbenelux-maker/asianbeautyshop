// ─────────────────────────────────────────────────────────────────────────
// /[locale]/ingredients/[slug] — single ingredient detail.
//
// Shows the translated display name, INCI, flags (key asset / allergen),
// the rich-text description authored via admin, and every product
// currently using the ingredient. Key-asset products float to the top.
//
// 404s when the slug doesn't resolve to a row, so old permalinks from
// renamed ingredients still fail gracefully instead of crashing.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Sparkles, AlertTriangle } from "lucide-react";

import { Link } from "@/i18n/routing";
import { getIngredientBySlug } from "@/lib/queries/ingredients";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { formatEur, priceLocale } from "@/lib/utils";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const ing = await getIngredientBySlug({ slug, locale });
  if (!ing) return {};
  return {
    ...buildPageMetadata({
      locale,
      tail: `/ingredients/${ing.slug}`,
      title: `${ing.displayName} — YU.R Skin Solution`,
      description:
        stripHtml(ing.descriptionHtml ?? "") ||
        `INCI: ${ing.inciName}. Learn how ${ing.displayName} works in skincare and which YU.R products use it.`,
    }),
    robots: { index: true, follow: true },
  };
}

export default async function IngredientDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const ing = await getIngredientBySlug({ slug, locale });
  if (!ing) notFound();

  const t = await getTranslations("ingredients");
  const tLegal = await getTranslations("legal");
  const currencyLocale = priceLocale(locale);

  return (
    <article className="container max-w-4xl py-16 md:py-24">
      {/* ── breadcrumb ──────────────────────────────────────────── */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid"
      >
        <Link href="/" className="transition-colors hover:text-ink">
          YU.R
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="/ingredients"
          className="transition-colors hover:text-ink"
        >
          {t("crumb")}
        </Link>
        <span aria-hidden>·</span>
        <span className="text-ink">{ing.displayName}</span>
      </nav>

      {/* ── masthead ────────────────────────────────────────────── */}
      <header className="mt-10 max-w-2xl">
        <div className="flex flex-wrap items-center gap-2">
          {ing.isKeyAsset && (
            <span className="inline-flex items-center gap-1 border border-vermilion/40 bg-vermilion/5 px-2 py-[2px] text-[10px] uppercase tracking-label text-vermilion">
              <Sparkles className="h-3 w-3" aria-hidden />
              {t("flag_key")}
            </span>
          )}
          {ing.isAllergen && (
            <span className="inline-flex items-center gap-1 border border-ink/30 bg-ink/5 px-2 py-[2px] text-[10px] uppercase tracking-label text-ink-mid">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {t("flag_allergen")}
            </span>
          )}
        </div>

        <h1 className="mt-4 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {ing.displayName}
        </h1>

        {ing.inciName !== ing.displayName && (
          <div className="mt-3 text-[12px] uppercase tracking-label text-ink-mid">
            INCI · {ing.inciName}
          </div>
        )}
      </header>

      <div className="rule my-10" />

      {ing.isFallback && (
        <p className="mb-8 text-[13px] text-ink-mid">
          <em>{tLegal("fallback_notice")}</em>
        </p>
      )}

      {/* ── description ─────────────────────────────────────────── */}
      {ing.descriptionHtml ? (
        <div
          className="prose-editorial text-[16px] leading-[1.75] text-ink-mid"
          dangerouslySetInnerHTML={{ __html: ing.descriptionHtml }}
        />
      ) : (
        <p className="text-[14px] leading-relaxed text-ink-mid">
          <em>{t("no_description")}</em>
        </p>
      )}

      {/* ── products using this ingredient ──────────────────────── */}
      <section className="mt-20" aria-labelledby="products-heading">
        <div className="mb-6 flex items-baseline justify-between border-b border-ink/10 pb-3">
          <h2
            id="products-heading"
            className="text-[11px] uppercase tracking-label text-ink-mid"
          >
            {t("products_heading")}
          </h2>
          <span className="text-[11px] uppercase tracking-label text-ink-mid">
            {t("product_count", { count: ing.products.length })}
          </span>
        </div>

        {ing.products.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-mid">
            <em>{t("no_products")}</em>
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {ing.products.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/shop/${p.slug}`}
                  className="group flex items-center gap-4 border border-ink/10 bg-white/60 p-4 transition-colors hover:border-vermilion/40"
                >
                  <div className="relative h-20 w-20 flex-shrink-0 bg-ink/5">
                    {p.imageUrl ? (
                      <Image
                        src={p.imageUrl}
                        alt={p.name}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {p.isKey && (
                      <div className="mb-1 inline-block text-[10px] uppercase tracking-label text-vermilion">
                        {t("product_flag_key")}
                      </div>
                    )}
                    <div className="truncate font-display text-[16px] leading-tight text-ink transition-colors group-hover:text-vermilion">
                      {p.name}
                    </div>
                    <div className="mt-1 text-[13px] text-ink-mid">
                      {formatEur(p.priceEur, currencyLocale)}
                    </div>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-ink-mid transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── back to index ───────────────────────────────────────── */}
      <div className="mt-16 border-t border-ink/10 pt-8">
        <Link
          href="/ingredients"
          className="text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
        >
          ← {t("back_to_index")}
        </Link>
      </div>
    </article>
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}
