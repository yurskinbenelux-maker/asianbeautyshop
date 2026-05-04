// ─────────────────────────────────────────────────────────────────────────
// /[locale]/rituals — editorial landing for the four-step routine.
//
// The homepage has a #ritual anchor that renders the same idea
// compactly, but that's a section, not a URL we can link to from menus,
// search engines, or marketing. This page gives the skincare routine its own
// address and pairs each step with:
//
//   · Category link — "Cleansers", "Treatments", …  so shoppers who
//     resonate with a step can jump straight to the right filtered grid.
//   · Quiz CTA — for shoppers who don't yet know where they land.
//
// Categories are matched by slug. If Sofia renames a category slug in
// admin, the matcher falls back to a soft link to /shop/category, so
// the page never crashes — it just becomes marginally less specific
// until she updates the slug map below.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";

import { Link } from "@/i18n/routing";
import { getShopCategories } from "@/lib/queries/products";
import { buildPageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ locale: string }> };

// Mapping from skincare routine step → category slug. If a slug doesn't exist
// yet in the DB (Sofia hasn't seeded that category), we fall back to
// /shop as a soft landing, with the correct category filter pre-applied.
// Key names stay stable (cleanse/treat/moisturise/protect) because they
// correspond to message-catalogue keys and Prisma Product.ritualStep.
const RITUAL_STEPS = [
  {
    key: "cleanse",
    number: "01",
    kr: "세안",
    categorySlug: "cleansers",
    fallback: "/shop?ritual=cleanse",
  },
  {
    key: "treat",
    number: "02",
    kr: "집중",
    categorySlug: "treatments",
    fallback: "/shop?ritual=treat",
  },
  {
    key: "moisturise",
    number: "03",
    kr: "보습",
    categorySlug: "moisturisers",
    fallback: "/shop?ritual=moisturise",
  },
  {
    key: "protect",
    number: "04",
    kr: "보호",
    categorySlug: "sunscreens",
    fallback: "/shop?ritual=protect",
  },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rituals" });
  return {
    ...buildPageMetadata({
      locale,
      tail: "/rituals",
      title: t("meta_title"),
      description: t("meta_description"),
    }),
    robots: { index: true, follow: true },
  };
}

export default async function RitualsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("skincare routines");
  const tRitual = await getTranslations("skincare routine");

  // Fetch live categories so the step cards can deep-link into the
  // right shop filter when the slug actually exists. We still render
  // all four steps either way — if one category is missing, the card
  // falls back to a filtered /shop URL.
  const categories = await getShopCategories(locale);
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  return (
    <article className="container max-w-4xl py-16 md:py-24">
      {/* ── masthead ─────────────────────────────────────────────── */}
      <header className="mx-auto max-w-2xl text-center">
        <div className="eyebrow">{t("eyebrow")}</div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {t("title")}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-mid">
          {t("lede")}
        </p>
        <div className="mt-8">
          <Link
            href="/quiz"
            className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-3 text-[12px] uppercase tracking-label text-rice hover:bg-vermilion hover:border-vermilion transition-colors"
          >
            {t("cta_quiz")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </header>

      <div className="rule my-16" />

      {/* ── four steps ──────────────────────────────────────────── */}
      <ol className="grid grid-cols-1 gap-x-10 gap-y-20 md:grid-cols-2">
        {RITUAL_STEPS.map((step) => {
          const cat = categoryBySlug.get(step.categorySlug);
          const href = cat ? `/shop/category/${cat.slug}` : step.fallback;
          const stepLabel = tRitual(step.key); // Cleanse / Treat / …
          return (
            <li
              key={step.key}
              className="grid grid-cols-[auto_1fr] items-start gap-8"
            >
              {/* ornament column */}
              <div className="flex flex-col items-center">
                <div className="font-display text-[64px] leading-none text-vermilion">
                  {step.number}
                </div>
                <div className="font-kr mt-2 text-[18px] text-ink-mid">
                  {step.kr}
                </div>
              </div>

              {/* content column */}
              <div className="border-l border-ink/10 pl-8">
                <h2 className="font-display text-[28px] leading-tight text-ink">
                  {stepLabel}
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-mid">
                  {t(`steps.${step.key}.body`)}
                </p>
                <Link
                  href={href}
                  className="mt-6 inline-flex items-center gap-2 text-[11px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 hover:text-vermilion"
                >
                  {cat ? t("shop_step", { step: stepLabel }) : t("shop_cta")}
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
                {cat ? (
                  <div className="mt-2 text-[11px] text-ink-mid">
                    {t("product_count", { count: cat.count })}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="rule my-20" />

      {/* ── closing CTA ─────────────────────────────────────────── */}
      <aside className="mx-auto max-w-xl text-center">
        <div className="eyebrow">{t("closing_eyebrow")}</div>
        <h2 className="mt-3 font-display text-display-sm text-ink">
          {t("closing_title")}
        </h2>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-mid">
          {t("closing_body")}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-4">
          <Link
            href="/quiz"
            className="text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 hover:text-vermilion"
          >
            {t("cta_quiz")}
          </Link>
          <Link
            href="/shop"
            className="text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
          >
            {t("cta_shop")}
          </Link>
        </div>
      </aside>
    </article>
  );
}
