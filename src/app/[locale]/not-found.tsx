// ─────────────────────────────────────────────────────────────────────────
// Localised 404 — wraps in the normal <main> so the nav + footer are
// present, and uses the same editorial system (eyebrow / font-display /
// hairline-underlined link) as the rest of the site.
//
// This file gets triggered when a segment inside /[locale]/ calls
// `notFound()` (PDP slug miss, journal 404, etc.). The root-level
// not-found.tsx still exists as a fallback for when a request fails
// above the locale layout.
//
// Note on i18n: Next.js renders locale not-founds via the nearest
// layout, which means `useTranslations` would require async loading.
// Using `getTranslations` keeps this a server component with no
// hydration cost.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";

export const metadata: Metadata = {
  title: "Page not found · YU.R",
  robots: { index: false, follow: false },
};

export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");
  return (
    <section className="container grid min-h-[calc(100vh-10rem)] place-items-center py-24">
      <div className="max-w-[52ch] text-center">
        <div className="eyebrow">404</div>
        <h1 className="mt-6 font-display text-[44px] leading-[1.05] text-ink md:text-[56px]">
          {t("title")}
        </h1>
        <p className="mt-6 text-[15px] leading-relaxed text-ink-mid">
          {t("lede")}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <Link
            href="/"
            className="text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 transition-colors hover:text-vermilion"
          >
            {t("cta_home")}
          </Link>
          <Link
            href="/shop"
            className="text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
          >
            {t("cta_shop")}
          </Link>
          <Link
            href="/journal"
            className="text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
          >
            {t("cta_journal")}
          </Link>
        </div>

        {/* Decorative seal — reinforces brand on a dead-end page */}
        <div className="mt-16 font-kr text-[40px] leading-none text-vermilion/40" aria-hidden>
          印
        </div>
      </div>
    </section>
  );
}
