// ─────────────────────────────────────────────────────────────────────────
// /[locale]/checkout — server entry.
//
// Thin server page: reads cart + settings + (optional) customer, hands off
// to the client form. Redirects to /cart if the cart is empty so people
// can't land here with nothing to pay for. No crawl indexing — checkout
// pages must never appear in SERPs.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Locale } from "@prisma/client";

import { buildPageMetadata } from "@/lib/seo/metadata";
import { peekCartSummary } from "@/lib/cart/cart";
import { readSetting } from "@/lib/settings";
import { getCurrentCustomer } from "@/lib/auth";
import { hasMollieKey } from "@/lib/mollie/client";
import { listMyAddresses } from "@/lib/queries/addresses";
import { computeOrderTotals } from "@/lib/checkout/pricing";
import { prisma } from "@/lib/prisma";

import { CheckoutClient } from "./checkout-client";
import { CheckoutUnavailable } from "./checkout-unavailable";

// /checkout reads the cart_token cookie, the customer session, and live
// cart contents. None of those are amenable to static rendering. Without
// this directive, Next.js tries to prerender /en/checkout, /nl/checkout
// etc. at build time (because the [locale] segment exposes
// generateStaticParams), and the cookies() call inside peekCartSummary
// throws a DynamicServerError that — in some code paths — escapes as a
// runtime 500. force-dynamic skips the static attempt entirely.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

// Checkout is noindex — nothing on here should show up in Google.
export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  const meta = buildPageMetadata({
    locale,
    tail: "/checkout",
    title: t("page_title"),
    description: t("page_lede"),
  });
  return {
    ...meta,
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage(props: Props) {
  // Outer try/catch wraps the entire page render so any thrown error
  // gets persisted to AuditLog with the actual message + stack before
  // re-raising. Reads back at /admin/audit. Temporary diagnostic —
  // remove once the prod /checkout 500 is identified.
  //
  // CRITICAL: Next.js uses thrown errors as control-flow signals
  // (NEXT_REDIRECT, NEXT_NOT_FOUND, DynamicServerError, etc.). Those
  // MUST reach the framework un-touched, so we detect them by their
  // `digest` property and re-throw without logging.
  try {
    return await CheckoutPageInner(props);
  } catch (err) {
    // Log EVERYTHING — including Next.js framework control-flow errors
    // (NEXT_REDIRECT, NEXT_NOT_FOUND, DynamicServerError) — so the
    // audit log surfaces the real cause. We re-throw after logging so
    // the framework still handles legitimate signals.
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? "(no stack)" : "(no stack)";
    const digest =
      err instanceof Error
        ? (err as Error & { digest?: string }).digest ?? null
        : null;
    try {
      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorEmail: null,
          action: "checkout.page_500_diagnostic",
          entityType: "Cart",
          entityId: null,
          summary: `CheckoutPage: ${message.slice(0, 400)}`,
          meta: {
            message,
            digest,
            stack: stack.slice(0, 3000),
          } as never,
          ip: null,
          userAgent: null,
        },
      });
    } catch {
      // Audit write failed — silently swallow so the original error
      // can still propagate to the framework.
    }
    throw err;
  }
}

async function CheckoutPageInner({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // 1. No Mollie key? Show a friendly "not configured yet" screen — prevents
  //    server-500s if an admin hasn't pasted her key into Hostinger yet.
  if (!hasMollieKey()) {
    return <CheckoutUnavailable locale={locale} />;
  }

  // 2. Read the cart. peekCartSummary doesn't mint a cart on miss, so an
  //    empty-cookie visitor will see itemCount === 0 and we'll bounce them
  //    back to /cart.
  const cart = await peekCartSummary({ locale: urlLocaleToPrisma(locale) });
  if (cart.items.length === 0) {
    redirect(`/${locale}/cart`);
  }

  // 3. Settings + customer context for form defaults. Parallel because none
  //    of them depend on each other.
  const [shipping, tax, customer] = await Promise.all([
    readSetting("shipping"),
    readSetting("tax"),
    getCurrentCustomer(),
  ]);

  // 4. If they're signed in, pull their saved addresses so we can preselect
  //    the default one on the form.
  const savedAddresses = customer
    ? await listMyAddresses(customer.profile.id)
    : [];
  const defaultAddress =
    savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0] ?? null;

  // 5. First-pass totals using the shipping country guess (default BE for
  //    Belgium-focused shop, or the saved default address country). The
  //    client recomputes the summary via the same pricing function once the
  //    user types a real country — this is just a pre-render value so the
  //    Total isn't empty on first paint.
  const initialCountry = defaultAddress?.country ?? "BE";
  const initialTotals = computeOrderTotals({
    cart,
    shippingCountry: initialCountry,
    coupon: null,
    shipping,
    tax,
  });

  return (
    <CheckoutClient
      locale={locale}
      cart={cart}
      shippingSettings={shipping}
      taxSettings={tax}
      initialTotals={initialTotals}
      customerEmail={customer?.profile.email ?? null}
      defaultAddress={
        defaultAddress
          ? {
              firstName: defaultAddress.firstName,
              lastName: defaultAddress.lastName,
              company: defaultAddress.company,
              line1: defaultAddress.line1,
              line2: defaultAddress.line2,
              city: defaultAddress.city,
              postcode: defaultAddress.postcode,
              region: defaultAddress.region,
              country: defaultAddress.country,
              phone: defaultAddress.phone,
            }
          : null
      }
    />
  );
}

function urlLocaleToPrisma(locale: string): Locale {
  switch (locale.toLowerCase()) {
    case "nl":
      return Locale.NL;
    case "fr":
      return Locale.FR;
    case "ru":
      return Locale.RU;
    default:
      return Locale.EN;
  }
}
