// ─────────────────────────────────────────────────────────────────────────
// /[locale]/newsletter/unsubscribed — landing after unsubscribe.
//
// Tone: warm and no-hard-feelings. No "are you sure?" dark patterns;
// we just confirm it's done and keep the door open.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";

export const metadata: Metadata = {
  title: "Unsubscribed — YU.R Skin Solution",
  robots: { index: false, follow: false },
};

const COPY: Record<string, { title: string; body: string; cta: string }> = {
  en: {
    title: "You're unsubscribed.",
    body: "No more newsletters from us. Your skin rituals are still welcome here whenever you'd like to visit.",
    cta: "Return to the shop",
  },
  nl: {
    title: "Je bent uitgeschreven.",
    body: "Geen nieuwsbrieven meer van ons. Je skin rituals zijn hier altijd welkom wanneer je ons weer wilt bezoeken.",
    cta: "Terug naar de shop",
  },
  fr: {
    title: "Vous êtes désabonné·e.",
    body: "Plus de lettres de notre part. Vos rituels de soin sont toujours les bienvenus ici, quand vous voudrez revenir.",
    cta: "Retour à la boutique",
  },
  ru: {
    title: "Вы отписаны.",
    body: "Больше писем от нас не будет. Ваши ритуалы ухода за кожей всегда будут рады вам, когда захотите вернуться.",
    cta: "Вернуться в магазин",
  },
};

export default async function NewsletterUnsubscribedPage({
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
        <div className="eyebrow">YU.R · Newsletter</div>
        <h1 className="mt-4 font-display text-[36px] leading-tight text-ink md:text-[44px]">
          {copy.title}
        </h1>
        <p className="mx-auto mt-6 max-w-[40ch] text-[15px] leading-relaxed text-ink-mid">
          {copy.body}
        </p>
        <Link
          href="/shop"
          className="mt-10 inline-flex items-center gap-2 border border-ink px-6 py-3 text-[12px] uppercase tracking-label text-ink hover:bg-ink hover:text-rice"
        >
          {copy.cta}
        </Link>
      </div>
    </main>
  );
}
