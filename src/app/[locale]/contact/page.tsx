// ─────────────────────────────────────────────────────────────────────────
// /[locale]/contact — public contact page.
//
// Two-column editorial layout on desktop: the left column holds Sofia's
// business card (brand, address, trade details — required under EU
// e-commerce law) and the right column holds the form. Mobile stacks.
//
// Prefills:
//   · customer name / email from the logged-in profile (if any)
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Mail, MapPin, Phone } from "lucide-react";

import { getCurrentCustomer } from "@/lib/auth";
import { ContactForm } from "./contact-form";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return {
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical: `/${locale}/contact`,
      languages: {
        en: "/en/contact",
        nl: "/nl/contact",
        fr: "/fr/contact",
        ru: "/ru/contact",
      },
    },
  };
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");

  // Prefill name/email if the visitor is signed in.
  const customer = await getCurrentCustomer().catch(() => null);
  const defaults = customer
    ? {
        name: [customer.profile.firstName, customer.profile.lastName]
          .filter(Boolean)
          .join(" ")
          .trim(),
        email: customer.profile.email,
      }
    : { name: "", email: "" };

  return (
    <section className="container py-16 md:py-24">
      {/* masthead — centred editorial title */}
      <header className="mx-auto max-w-2xl text-center">
        <div className="eyebrow">{t("eyebrow")}</div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {t("title")}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-mid">
          {t("lede")}
        </p>
      </header>

      <div className="mt-14 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] md:gap-16">
        {/* ─── Sofia's business card ───────────────────────────────── */}
        <aside className="space-y-10">
          <div>
            <div className="eyebrow">{t("reach_us")}</div>
            <dl className="mt-4 space-y-4 text-[14px] leading-relaxed text-ink">
              <ContactRow icon={<Mail className="h-4 w-4" aria-hidden />} term={t("label_email")}>
                <a
                  href="mailto:hello@yurskinsolution.eu"
                  className="underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
                >
                  hello@yurskinsolution.eu
                </a>
              </ContactRow>

              <ContactRow icon={<Phone className="h-4 w-4" aria-hidden />} term={t("label_phone")}>
                <a
                  href="tel:+32000000000"
                  className="underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
                >
                  +32 (0)0 000 00 00
                </a>
                <div className="mt-1 text-[12px] text-ink-mid">
                  {t("phone_hours")}
                </div>
              </ContactRow>

              <ContactRow icon={<MapPin className="h-4 w-4" aria-hidden />} term={t("label_address")}>
                <address className="not-italic text-[14px] leading-relaxed text-ink">
                  K&apos;Elmus Group BV
                  <br />
                  Rue de la Clinique 10
                  <br />
                  1070 Anderlecht, {t("country_be")}
                </address>
              </ContactRow>
            </dl>
          </div>

          {/* Trade & legal details — EU consumer law requires these on
              public-facing pages and makes them look legitimate. */}
          <div className="border-t border-ink/10 pt-6">
            <div className="eyebrow">{t("company_details")}</div>
            <dl className="mt-4 space-y-2 text-[13px] text-ink-mid">
              <DetailRow label={t("label_company")}>K&apos;Elmus Group BV</DetailRow>
              <DetailRow label={t("label_vat")}>BE 1015.XXX.XXX</DetailRow>
              <DetailRow label={t("label_kbo")}>1015.XXX.XXX</DetailRow>
              <DetailRow label={t("label_registered")}>
                {t("value_registered")}
              </DetailRow>
            </dl>
          </div>

          {/* Service SLA — sets expectations so Sofia doesn't get chased */}
          <div className="border border-ink/10 bg-white/40 p-5">
            <div className="eyebrow">{t("response_title")}</div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
              {t("response_body")}
            </p>
          </div>
        </aside>

        {/* ─── form ─────────────────────────────────────────────────── */}
        <div>
          <ContactForm locale={locale} defaults={defaults} />
        </div>
      </div>
    </section>
  );
}

// ────────── small presentational helpers ──────────────────────────────

function ContactRow({
  icon,
  term,
  children,
}: {
  icon: React.ReactNode;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 items-center justify-center border border-ink/15 text-ink-mid">
        {icon}
      </div>
      <div>
        <dt className="text-[11px] uppercase tracking-label text-ink-mid">{term}</dt>
        <dd className="mt-1">{children}</dd>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      <dt className="min-w-[110px] text-[12px] uppercase tracking-label text-ink-mid/80">
        {label}
      </dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
