// ─────────────────────────────────────────────────────────────────────────
// Root layout — wraps every page with fonts, i18n provider, nav, footer.
// Path: src/app/[locale]/layout.tsx  (the [locale] segment is handled by
// next-intl; middleware.ts redirects bare URLs to the right locale).
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Fraunces, Noto_Serif_KR, Inter } from "next/font/google";

import { Toaster } from "sonner";

import { routing } from "@/i18n/routing";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { SkipLink } from "@/components/layout/skip-link";
import { ConciergeOrb } from "@/components/concierge/orb";
import { MotionProvider } from "@/components/motion/motion-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { peekCartSummary } from "@/lib/cart/cart";
import { CookieBanner } from "@/components/consent/cookie-banner";
import { readConsentCookie } from "@/lib/consent/consent";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationJsonLd, websiteJsonLd, siteOrigin } from "@/lib/seo/json-ld";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { getTranslations } from "next-intl/server";
import { Locale } from "@prisma/client";

import "../globals.css";

// ─── Fonts ─────────────────────────────────────────────────────────────
// next/font/google self-hosts the fonts (no external CDN request, GDPR-safe).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["SOFT", "WONK"],
});
const notoKR = Noto_Serif_KR({
  subsets: ["latin"], // KR glyphs load automatically, but we ask for latin too
  weight: ["400", "500", "700"],
  variable: "--font-kr",
  display: "swap",
  preload: false, // KR glyphs are heavy — lazy load
});
const inter = Inter({
  subsets: ["latin", "cyrillic"], // cyrillic for RU locale
  variable: "--font-body",
  display: "swap",
});

// ─── SEO / metadata defaults ───────────────────────────────────────────
// We generate metadata per-locale so every page ships with a correct
// canonical URL + full hreflang set. Child routes may further override
// title / description via their own generateMetadata (Next merges them).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });

  const base = buildPageMetadata({
    locale,
    tail: "",
    title: t("home.title"),
    description: t("home.description"),
    ogImage: `${siteOrigin()}/brand/og-default.jpg`,
  });

  return {
    ...base,
    metadataBase: new URL(siteOrigin()),
    title: {
      default: t("home.title"),
      template: t("title_template"),
    },
    openGraph: {
      ...base.openGraph,
      siteName: "YU.R Skin Solution",
    },
    robots: { index: true, follow: true },
    // Brand favicon + social icons. Points at the real vector logo so
    // any future logo swap only needs to touch /public/brand/ — no icon
    // regeneration required. Modern browsers render the SVG directly;
    // older ones fall through to apple-touch-icon.png if present.
    icons: {
      icon: [
        { url: "/brand/logo-lockup.svg", type: "image/svg+xml" },
      ],
      shortcut: "/brand/logo-lockup.svg",
      apple: "/brand/apple-touch-icon.png",
    },
    formatDetection: {
      // Prevent iOS from auto-linking phone numbers / addresses — they
      // conflict with our editorial typography.
      telephone: false,
      address: false,
      email: false,
    },
  };
}

// Pre-render every locale at build time (4 pages instead of 1 — cheap).
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // Guard against garbage locale segments
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  // Required for static rendering
  setRequestLocale(locale);
  const messages = await getMessages();

  // Seed the cart provider with the current server-side cart (if any).
  // peekCartSummary is a pure read — it won't create a cart for a
  // first-time visitor, so static pages don't all get a Cart row written.
  const prismaLocale =
    locale === "nl"
      ? Locale.NL
      : locale === "fr"
        ? Locale.FR
        : locale === "ru"
          ? Locale.RU
          : Locale.EN;
  const initialCart = await peekCartSummary({ locale: prismaLocale });

  // Read the consent cookie so we can hide the banner immediately for
  // returning visitors — no flash of "we use cookies" on every page view.
  const consent = await readConsentCookie();

  return (
    <html
      lang={locale}
      className={`${fraunces.variable} ${notoKR.variable} ${inter.variable}`}
    >
      <body className="min-h-screen">
        {/* Sitewide schema.org blocks — identifies the organisation and
            primes the sitelinks search box. Emitted once per page via the
            root layout so every route benefits. */}
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
        <NextIntlClientProvider messages={messages}>
          <MotionProvider>
            <CartProvider initialCart={initialCart}>
              {/* WCAG 2.4.1 — first tabbable, jumps past nav/locale/cart */}
              <SkipLink />
              <Nav />
              <main id="main" className="relative">{children}</main>
              <Footer />
              <ConciergeOrb />
              <CartDrawer />
              <CookieBanner initialHasConsent={consent !== null} />
              <Toaster
                position="bottom-center"
                toastOptions={{
                  // match the editorial aesthetic — rice paper card, ink text
                  style: {
                    background: "#F8F4EC",
                    color: "#121110",
                    border: "1px solid rgba(18,17,16,0.1)",
                    borderRadius: "0",
                    fontFamily: "var(--font-body)",
                  },
                }}
              />
            </CartProvider>
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
