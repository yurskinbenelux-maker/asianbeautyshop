// ─────────────────────────────────────────────────────────────────────────
// /[locale]/quiz — dedicated skin quiz page.
//
// Why a full page when the orb already has a quiz?
//   · SEO — we can actually surface this in search for queries like
//     "Korean skincare routine quiz".
//   · Editorial scale — the orb panel is ~360 px wide, this lets us use
//     display-sized question copy and a generous ritual reveal.
//   · Link targets — homepage CTA and footer can point here.
//
// The interactive logic lives in quiz-client.tsx; this wrapper is a pure
// server component so we can still do static rendering per locale and
// hand the metadata hreflangs to Google cleanly.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";

import { QuizClient } from "./quiz-client";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "quizPage" });
  return {
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical: `/${locale}/quiz`,
      languages: {
        en: "/en/quiz",
        nl: "/nl/quiz",
        fr: "/fr/quiz",
        ru: "/ru/quiz",
      },
    },
  };
}

export default async function QuizPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("quizPage");

  return (
    <section className="relative overflow-hidden">
      {/* Soft decorative wash — echoes the hero treatment without the video */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#C8102E0F,transparent_60%)]"
      />

      <div className="container relative py-16 md:py-24">
        {/* masthead */}
        <header className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 border border-ink/15 bg-white/60 px-3 py-1">
            <Sparkles className="h-3 w-3 text-vermilion" aria-hidden />
            <span className="text-[10px] uppercase tracking-label text-ink-mid">
              {t("eyebrow")}
            </span>
          </div>
          <h1 className="mt-5 font-display text-display-md leading-tight text-ink md:text-display-lg">
            {t("title")}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-mid">
            {t("lede")}
          </p>
        </header>

        {/* The interactive card sits on a solid white-ish surface so the
            step buttons read well against the wash. */}
        <div className="mx-auto mt-12 max-w-3xl md:mt-16">
          <QuizClient locale={locale} />
        </div>
      </div>
    </section>
  );
}
