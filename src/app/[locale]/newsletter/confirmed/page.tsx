// ─────────────────────────────────────────────────────────────────────────
// /[locale]/newsletter/confirmed — landing after a successful double-opt-in.
//
// Minimal editorial page: confirms they're on the list, nudges back to the
// shop. Noindex so Google never surfaces it organically.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Check } from "lucide-react";

export const metadata: Metadata = {
  title: "You're in — Asian Beauty Shop",
  robots: { index: false, follow: false },
};

const COPY: Record<string, { title: string; body: string; cta: string }> = {
  en: {
    title: "You're on the list.",
    body: "One letter a month — new arrivals, ingredient notes, and the occasional quiet thought. You can unsubscribe from any email.",
    cta: "Back to the shop",
  },
  nl: {
    title: "Je staat op de lijst.",
    body: "Eén brief per maand — nieuwe aankomsten, ingrediëntennotities en af en toe een stille gedachte. Je kunt je in elke e-mail uitschrijven.",
    cta: "Terug naar de shop",
  },
  fr: {
    title: "Vous êtes sur la liste.",
    body: "Une lettre par mois — nouveautés, notes d'ingrédients et, parfois, une pensée plus calme. Vous pouvez vous désabonner depuis chaque e-mail.",
    cta: "Retour à la boutique",
  },
  ru: {
    title: "Вы в списке.",
    body: "Одно письмо в месяц — новинки, заметки об ингредиентах и иногда тихая мысль. Отписаться можно из любого письма.",
    cta: "Вернуться в магазин",
  },
};

export default async function NewsletterConfirmedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const copy = COPY[locale] ?? COPY.en;

  return (
    <main className="container flex min-h-[60vh] items-center justify-center py-24">
      <div className="mx-auto max-w-[48ch] text-center">
        <div className="mx-auto mb-8 flex h-14 w-14 items-center justify-center border border-sage/40 bg-sage/5 text-sage">
          <Check className="h-6 w-6" />
        </div>
        <div className="eyebrow">Asian Beauty Shop · Newsletter</div>
        <h1 className="mt-4 font-display text-[36px] leading-tight text-ink md:text-[44px]">
          {copy.title}
        </h1>
        <p className="mx-auto mt-6 max-w-[40ch] text-[15px] leading-relaxed text-ink-mid">
          {copy.body}
        </p>
        <Link
          href="/shop"
          className="mt-10 inline-flex items-center gap-2 border border-ink bg-ink px-6 py-3 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
        >
          {copy.cta}
        </Link>
      </div>
    </main>
  );
}
