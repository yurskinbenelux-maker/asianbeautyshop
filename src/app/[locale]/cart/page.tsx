// ─────────────────────────────────────────────────────────────────────────
// /[locale]/cart — dedicated cart page.
//
// Purpose:
//   · Gives the slide-in drawer a full-page counterpart for people who
//     prefer to review their basket on a real page (abandoned-cart
//     email links land here; mobile users sometimes do too).
//   · Shares state with the drawer via CartProvider — any change here
//     updates the drawer/badge instantly, and vice-versa.
//
// Why a thin server page + client view:
//   · Server side: sets request locale, emits per-locale metadata with
//     `noindex` (a cart page has no SEO value and shouldn't compete with
//     real pages for crawl budget).
//   · Client side: the interactive grid lives in <CartPageView /> which
//     consumes the existing useCart() hook.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { CartPageView } from "./cart-page-view";

type Props = { params: Promise<{ locale: string }> };

// Per-locale metadata. Cart pages are `noindex, follow` — indexing them
// would pollute SERPs and leak personalised content into search caches.
export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart" });
  const meta = buildPageMetadata({
    locale,
    tail: "/cart",
    title: t("page_title"),
    description: t("page_lede"),
  });
  return {
    ...meta,
    robots: { index: false, follow: true },
  };
}

export default async function CartPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The CartProvider (mounted in the [locale] layout) already holds the
  // initial summary read from the cookie; the page itself just renders.
  return <CartPageView />;
}
