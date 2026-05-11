// ─────────────────────────────────────────────────────────────────────────
// /[locale]/newsletter/invalid — landing when a confirm/unsubscribe link
// is expired, reused, or simply wrong.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";

export const metadata: Metadata = {
  title: "Link expired — Asian Beauty Shop",
  robots: { index: false, follow: false },
};

const COPY: Record<string, { title: string; body: string; cta: string }> = {
  en: {
    title: "That link has expired.",
    body: "Confirmation and unsubscribe links are single-use. If you meant to subscribe, you can enter your email again on the homepage.",
    cta: "Back to the homepage",
  },
  nl: {
    title: "Deze link is verlopen.",
    body: "Bevestigings- en uitschrijflinks zijn eenmalig bruikbaar. Wil je je opnieuw inschrijven, geef dan je e-mailadres opnieuw op de homepage op.",
    cta: "Terug naar de homepage",
  },
  fr: {
    title: "Ce lien a expiré.",
    body: "Les liens de confirmation et de désinscription sont à usage unique. Pour vous inscrire à nouveau, saisissez votre e-mail depuis la page d'accueil.",
    cta: "Retour à l'accueil",
  },
  ru: {
    title: "Эта ссылка больше не действует.",
    body: "Ссылки для подтверждения и отписки одноразовые. Если вы хотели подписаться, введите адрес снова на главной странице.",
    cta: "На главную",
  },
};

export default async function NewsletterInvalidPage({
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
        <div className="eyebrow">Asian Beauty Shop · Newsletter</div>
        <h1 className="mt-4 font-display text-[36px] leading-tight text-ink md:text-[44px]">
          {copy.title}
        </h1>
        <p className="mx-auto mt-6 max-w-[40ch] text-[15px] leading-relaxed text-ink-mid">
          {copy.body}
        </p>
        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-2 border border-ink px-6 py-3 text-[12px] uppercase tracking-label text-ink hover:bg-ink hover:text-rice"
        >
          {copy.cta}
        </Link>
      </div>
    </main>
  );
}
