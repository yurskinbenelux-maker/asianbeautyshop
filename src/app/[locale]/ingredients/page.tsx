// ─────────────────────────────────────────────────────────────────────────
// /[locale]/ingredients — alphabetised index of every ingredient in the
// catalogue, with a separate "Key actives" lane up top.
//
// Architecture (refactored 2026-05-06):
//   · The server component fetches the full ingredient set once and
//     renders the masthead + empty state.
//   · The listing + alphabet filter is delegated to
//     <IngredientsAlphabetView> (client component) so picking a
//     letter narrows both lanes instantly without a server round-trip.
//
// Empty-state is handled gracefully: if there are no ingredients in the
// DB yet, we show a friendly placeholder instead of a blank grid.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";

import { Link } from "@/i18n/routing";
import { listActiveIngredients } from "@/lib/queries/ingredients";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { IngredientsAlphabetView } from "@/components/ingredients/alphabet-filter";

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

  const keyActives = rows.filter((r) => r.isKeyAsset);
  const others = rows.filter((r) => !r.isKeyAsset);

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
        // Pass plain serializable data only — the client component
        // pulls its own translations via `useTranslations`. Functions
        // can't cross the RSC boundary in Next.js 15.
        <IngredientsAlphabetView
          keyActives={keyActives.map((r) => ({
            slug: r.slug,
            displayName: r.displayName,
            inciName: r.inciName,
            shortDescription: r.shortDescription,
            isKeyAsset: r.isKeyAsset,
            productCount: r.productCount,
          }))}
          others={others.map((r) => ({
            slug: r.slug,
            displayName: r.displayName,
            inciName: r.inciName,
            shortDescription: r.shortDescription,
            isKeyAsset: r.isKeyAsset,
            productCount: r.productCount,
          }))}
        />
      )}
    </article>
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
