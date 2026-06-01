// ─────────────────────────────────────────────────────────────────────────
// /[locale]/checkout — client form.
//
// Two-column on desktop: the contact + address form on the left, the
// sticky order summary on the right. Stacks on mobile.
//
// Flow on submit:
//   1. Collect FormData, call the `submitCheckout` server action
//   2. Server validates with zod, runs placeOrder(), creates a Mollie
//      payment, and returns { checkoutUrl }.
//   3. We window.location.replace(checkoutUrl) to hand the visitor over
//      to Mollie's hosted pay page. Mollie then bounces them back to
//      /checkout/success?order=ABS-… or /checkout/failure?…
//
// Why a plain <form action={...}> wasn't enough:
//   · We want to redirect to an external URL (Mollie) on success. Next's
//     server-action `redirect()` helper is for internal routes — external
//     redirects must be driven by the client, which is exactly what we do.
//   · We want inline field-error mapping without losing what the user
//     typed.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";

import { cn, formatEur, priceLocale } from "@/lib/utils";
import type { CartSummary } from "@/lib/cart/types";
import type { ShippingSettings, TaxSettings } from "@/lib/settings";
import {
  computeOrderTotals,
  type PricingResult,
} from "@/lib/checkout/pricing";

import { submitCheckout, type CheckoutErrorCode } from "./actions";
import { AddressAutocomplete } from "@/components/checkout/address-autocomplete";
import { GiftCardCodesField } from "@/components/checkout/gift-card-codes-field";
import {
  CouponField,
  type AppliedCoupon,
} from "@/components/checkout/coupon-field";
import { trackInitiateCheckout } from "@/lib/analytics/meta-pixel";

// ────────── props ───────────────────────────────────────────────────────

export type CheckoutAddressDefaults = {
  firstName: string;
  lastName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  region: string | null;
  country: string;
  phone: string | null;
};

export function CheckoutClient({
  locale,
  cart,
  shippingSettings,
  taxSettings,
  initialTotals,
  customerEmail,
  defaultAddress,
}: {
  locale: string;
  cart: CartSummary;
  shippingSettings: ShippingSettings;
  taxSettings: TaxSettings;
  initialTotals: PricingResult;
  customerEmail: string | null;
  defaultAddress: CheckoutAddressDefaults | null;
}) {
  const t = useTranslations("checkout");
  const currencyLocale = priceLocale(locale);
  const hasTrackedInitiateCheckout = useRef(false);
  
  // ── local state ────────────────────────────────────────────────────
  // The only reason we keep a shallow local state for country/subtotal is
  // so the Order Summary can update its shipping-free/flat-rate line and
  // VAT line as the user types — without re-roundtripping to the server.
  // All authoritative pricing still happens server-side in placeOrder().

  const [country, setCountry] = useState<string>(
    defaultAddress?.country ?? "BE",
  );
  // Live coupon preview — fed by the CouponField's onCouponChange. The
  // CouponField's Apply button calls lookupCouponAction server-side and
  // hands back the validated shape; we feed it straight into
  // computeOrderTotals(...) so the order summary re-renders with the
  // strike-through subtotal + new grand total in real time.
  //
  // The coupon code rides along on the form via a hidden input inside
  // CouponField — placeOrder() re-validates against the DB at submit
  // time, so a stale tab can't fake a discount even if we trusted this
  // state for the preview.
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(
    null,
  );
  // Live total of redeemed gift card balances. Subtracted from grandTotal
  // in the previewed totals so the customer sees the impact before submit.
  const [giftCardBalanceEur, setGiftCardBalanceEur] = useState(0);

  // True when every cart line is a gift card (or any other digital good).
  // Drives whether we render the shipping form section at all — for a
  // digital-only order we collect only a billing address (for VAT + Mollie
  // fraud scoring) and skip everything to do with the parcel.
  const cartIsDigitalOnly =
    cart.items.length > 0 && cart.items.every((i) => !i.requiresShipping);
  const [billingSame, setBillingSame] = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  // Optional Mollie quick-pick. null → land on Mollie's full method picker.
  // Wallet methods (applepay, googlepay) feel "express" because Mollie's
  // hosted page drops the customer straight into the device's wallet UI.
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topLevelError, setTopLevelError] = useState<CheckoutErrorCode | null>(
    null,
  );
  // TEMP DIAGNOSTIC — surfaces the raw error message from
  // submitCheckout's catch when it threw. Remove with the rest of the
  // diagnostic instrumentation once the prod 500 is fixed.
  const [debugMessage, setDebugMessage] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  // Client-side totals preview — now includes the validated coupon so
  // the order summary can show a strike-through subtotal + new grand
  // total the moment the customer clicks Apply on the CouponField.
  // The server re-validates the coupon at submit time, so we're not
  // trusting the client to authorise the discount — just previewing it.
  const previewTotals = useMemo(
    () =>
      computeOrderTotals({
        cart,
        shippingCountry: country,
        coupon: appliedCoupon
          ? {
              code: appliedCoupon.code,
              kind: appliedCoupon.kind,
              value: appliedCoupon.value,
              minSubtotal: appliedCoupon.minSubtotal,
            }
          : null,
        shipping: shippingSettings,
        tax: taxSettings,
        // Gift card balance applied here is a preview only — the server
        // re-validates each code in place-order before actually drawing
        // it down, so a stale tab can't fake a discount.
        giftCardBalanceEur: giftCardBalanceEur > 0 ? giftCardBalanceEur : undefined,
      }),
    [
      cart,
      country,
      shippingSettings,
      taxSettings,
      giftCardBalanceEur,
      appliedCoupon,
    ],
  );

  // Fall back to the server's first-render totals only when nothing
  // could possibly have changed since SSR. As soon as the customer
  // touches country, gift cards, OR a coupon, prefer the live preview.
  const totals: PricingResult =
    country === (defaultAddress?.country ?? "BE") &&
    giftCardBalanceEur === 0 &&
    appliedCoupon === null
      ? initialTotals
      : previewTotals;

  // Meta Pixel: InitiateCheckout — fires once when the checkout page loads.
  useEffect(() => {
    if (hasTrackedInitiateCheckout.current) return;
    if (cart.items.length === 0) return;

    hasTrackedInitiateCheckout.current = true;

    trackInitiateCheckout({
      value: initialTotals.grandTotalEur,
      currency: cart.currency,
      contentIds: cart.items.map((item) => item.productId),
      numItems: cart.itemCount,
    });
  }, [cart, initialTotals.grandTotalEur]);

  // ── submit ─────────────────────────────────────────────────────────

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setTopLevelError(null);
    setDebugMessage(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await submitCheckout(formData);
      if (result.ok) {
        // Hand off to Mollie's hosted pay page.
        window.location.replace(result.checkoutUrl);
        return;
      }

      if (result.error === "VALIDATION_FAILED") {
        setFieldErrors(result.fieldErrors ?? {});
      } else {
        setTopLevelError(result.error);
        // TEMP DIAGNOSTIC — pull the debug message off the result if
        // present (set by submitCheckout's diagnostic catch).
        const dm = (result as { debugMessage?: string }).debugMessage;
        if (typeof dm === "string" && dm.length > 0) setDebugMessage(dm);
      }
    });
  }

  const shippable = totals.shippable;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 md:px-10 md:pt-16 lg:pt-20">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="max-w-2xl">
        <div className="eyebrow">{t("eyebrow")}</div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {t("page_title")}
        </h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-mid">
          {t("page_lede")}
        </p>
      </header>

      <div className="rule my-10" />

      <form onSubmit={onSubmit} noValidate>
        <input type="hidden" name="locale" value={locale} />
        <input
          type="hidden"
          name="billingSame"
          value={billingSame ? "yes" : "no"}
        />
        <input
          type="hidden"
          name="marketingOptIn"
          value={marketingOptIn ? "yes" : "no"}
        />

        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">
          {/* ── Left: fields ───────────────────────────────────────── */}
          <div className="space-y-12">
            {/* Contact */}
            <Section title={t("section_contact")}>
              <Field
                label={t("field_email")}
                name="email"
                type="email"
                defaultValue={customerEmail ?? ""}
                required
                error={fieldErrors.email}
                autoComplete="email"
              />
              <label className="mt-5 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 border-ink/20 accent-vermilion"
                />
                <span className="text-[13px] leading-relaxed text-ink">
                  {t("field_marketing")}
                </span>
              </label>
            </Section>

            {/* Shipping address — hidden for digital-only carts (gift
                cards have nothing to put in a parcel). The form falls
                back to a billing-only layout. */}
            {!cartIsDigitalOnly && (
              <Section title={t("section_shipping")}>
                <AddressFields
                  prefix="shipping"
                  defaults={defaultAddress}
                  fieldErrors={fieldErrors}
                  onCountryChange={setCountry}
                  t={t}
                />
              </Section>
            )}

            {/* Billing — for a mixed/physical cart this is "Billing same?
                / Billing details", for a digital-only cart it's the only
                address we collect (used for VAT invoice + Mollie risk). */}
            <Section
              title={
                cartIsDigitalOnly
                  ? t("section_billing_only")
                  : t("section_billing")
              }
            >
              {cartIsDigitalOnly ? (
                <>
                  <p className="mb-5 text-[12px] leading-relaxed text-ink-mid">
                    {t("billing_only_hint")}
                  </p>
                  <AddressFields
                    prefix="billing"
                    defaults={defaultAddress}
                    fieldErrors={fieldErrors}
                    onCountryChange={setCountry}
                    t={t}
                  />
                </>
              ) : (
                <>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={billingSame}
                      onChange={(e) => setBillingSame(e.target.checked)}
                      className="mt-0.5 h-4 w-4 border-ink/20 accent-vermilion"
                    />
                    <span className="text-[13px] leading-relaxed text-ink">
                      {t("field_billing_same")}
                    </span>
                  </label>

                  {!billingSame && (
                    <div className="mt-6">
                      <AddressFields
                        prefix="billing"
                        defaults={null}
                        fieldErrors={fieldErrors}
                        t={t}
                      />
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* Submit-time signal so the server can distinguish a digital-
                only checkout (no shipping address required, no parcel
                created). The client-side flag isn't authoritative — the
                server re-derives it from cart contents. */}
            <input
              type="hidden"
              name="cartIsDigitalOnly"
              value={cartIsDigitalOnly ? "yes" : "no"}
            />

            {/* Extras */}
            <Section title={t("section_extras")}>
              {/* Coupon — now has its own Apply button (matches the
                  gift-card pattern). Validates server-side on click,
                  shows a chip with the discount preview, feeds the
                  validated coupon shape up to previewTotals so the
                  order summary re-renders with strike-through subtotal
                  + new grand total in real time. */}
              <CouponField onCouponChange={setAppliedCoupon} />
              {/* Gift card redemption — bearer token, can stack multiple codes
                  on one order. The disclaimer below flips loud → calm based
                  on whether the customer is signed in. */}
              <div className="mt-5">
                <GiftCardCodesField
                  isLoggedIn={!!customerEmail}
                  currencyLocale={currencyLocale}
                  onBalanceChange={setGiftCardBalanceEur}
                />
              </div>
              <div className="mt-5">
                <label className="block">
                  <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
                    {t("field_notes")}
                  </span>
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={1000}
                    className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
                    placeholder={t("field_notes_placeholder")}
                  />
                </label>
              </div>
            </Section>
          </div>

          {/* ── Right: summary ─────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-32 lg:self-start">
            <div className="border border-ink/10 bg-white/60 p-6 md:p-8">
              <div className="eyebrow">{t("summary_title")}</div>

              {/* Line items — when a coupon is active, show strike-through
               *  on each eligible product line so the customer can see the
               *  discount apply per-product. Gift cards never get the
               *  strikethrough because they're a payment instrument, not a
               *  discountable product. */}
              <ul className="mt-5 space-y-4">
                {cart.items.map((item) => {
                  // Eligible for discount? Only physical products. Gift
                  // cards (requiresShipping=false) are excluded.
                  const eligibleForDiscount =
                    totals.discountRate > 0 && item.requiresShipping;
                  const discountedLineTotal = eligibleForDiscount
                    ? Math.round(
                        item.lineTotalEur *
                          (1 - totals.discountRate / 100) *
                          100,
                      ) / 100
                    : item.lineTotalEur;
                  return (
                    <li key={item.id} className="flex gap-4">
                      <div className="relative h-16 w-14 shrink-0 overflow-hidden bg-ink/5">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.name}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-ink-mid">
                            <ShoppingBag className="h-4 w-4" aria-hidden />
                          </div>
                        )}
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center bg-ink px-1 text-[10px] text-rice">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col justify-between gap-1">
                        <div className="text-[13px] leading-tight text-ink">
                          {item.name}
                        </div>
                        {item.variantLabel || item.volumeMl ? (
                          <div className="text-[10px] uppercase tracking-label text-ink-mid">
                            {item.variantLabel ??
                              (item.volumeMl ? `${item.volumeMl} ml` : "")}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end text-[13px] tabular-nums">
                        {eligibleForDiscount ? (
                          <>
                            <span className="text-ink-mid line-through opacity-60">
                              {formatEur(item.lineTotalEur, currencyLocale)}
                            </span>
                            <span className="text-vermilion">
                              {formatEur(discountedLineTotal, currencyLocale)}
                            </span>
                          </>
                        ) : (
                          <span className="text-ink">
                            {formatEur(item.lineTotalEur, currencyLocale)}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-6 space-y-2.5 border-t border-ink/10 pt-5 text-[13px]">
                {/* Subtotal — strike-through when a coupon discount is
                 *  applied, so the customer sees the pre/post comparison
                 *  in the same row. The discount itself renders as a
                 *  vermilion-tinted negative line below. */}
                {totals.discountEur > 0 ? (
                  <div className="flex items-baseline justify-between text-ink-mid">
                    <span className="text-[13px]">{t("summary_subtotal")}</span>
                    <span className="tabular-nums">
                      <span className="line-through opacity-60">
                        {formatEur(totals.subtotalEur, currencyLocale)}
                      </span>
                      <span className="ml-2 text-ink">
                        {formatEur(
                          Math.max(0, totals.subtotalEur - totals.discountEur),
                          currencyLocale,
                        )}
                      </span>
                    </span>
                  </div>
                ) : (
                  <Line
                    label={t("summary_subtotal")}
                    value={formatEur(totals.subtotalEur, currencyLocale)}
                  />
                )}
                {/* Coupon discount — vermilion, signed negative so it
                 *  reads as money coming OFF the bill. Hidden when
                 *  there's nothing to show. */}
                {totals.discountEur > 0 ? (
                  <div className="flex items-baseline justify-between text-vermilion">
                    <span className="text-[13px]">
                      {appliedCoupon
                        ? `${t("summary_discount")} · ${appliedCoupon.code}`
                        : t("summary_discount")}
                    </span>
                    <span className="tabular-nums">
                      − {formatEur(totals.discountEur, currencyLocale)}
                    </span>
                  </div>
                ) : null}
                <Line
                  label={t("summary_shipping")}
                  value={
                    !shippable
                      ? t("summary_not_shippable")
                      : totals.shippingEur === 0
                        ? t("summary_shipping_free")
                        : formatEur(totals.shippingEur, currencyLocale)
                  }
                  hint={shippingReasonLabel(totals, t, shippingSettings)}
                />
                {taxSettings.includedInPrice ? (
                  <Line
                    label={t("summary_tax_included")}
                    value={formatEur(totals.taxEur, currencyLocale)}
                    muted
                  />
                ) : (
                  <Line
                    label={t("summary_tax")}
                    value={formatEur(totals.taxEur, currencyLocale)}
                  />
                )}
              </div>

              <div className="mt-5 border-t border-ink/10 pt-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] uppercase tracking-label text-ink-mid">
                    {t("summary_total")}
                  </span>
                  <span className="font-display text-[24px] text-ink">
                    {formatEur(totals.grandTotalEur, currencyLocale)}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-mid">
                  {shippingSettings.disclaimer}
                </p>
              </div>

              {topLevelError && (
                <div className="mt-5 border border-vermilion/30 bg-vermilion/5 px-3 py-2 text-[12px] text-vermilion">
                  {t(`error.${topLevelError}`)}
                  {/* TEMP DIAGNOSTIC — surfaces the real error string
                      from submitCheckout's catch. Remove when the
                      checkout 500 is fixed. */}
                  {debugMessage && (
                    <div className="mt-2 font-mono text-[11px] leading-relaxed break-all">
                      {debugMessage}
                    </div>
                  )}
                </div>
              )}

              {/* ── Method quick-pick ──────────────────────────────────
                  Each tile preselects a Mollie method so the hosted page
                  lands directly on that wallet/method UI (no extra click
                  on Mollie's picker). The "All methods" tile reverts to
                  the default (Mollie shows everything an admin enabled).
                  Apple Pay only shows on devices where it works; we let
                  Mollie's hosted page handle the unavailable case
                  gracefully — surfacing it everywhere is fine.
                  Hidden input ties the React state into FormData. */}
              <fieldset className="mt-6">
                <legend className="mb-2 text-[11px] uppercase tracking-label text-ink-mid">
                  {t("payment_method_label")}
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  <PaymentMethodTile
                    value="applepay"
                    label="Apple Pay"
                    iconUrl="https://www.mollie.com/external/icons/payment-methods/applepay.svg"
                    selected={paymentMethod === "applepay"}
                    onSelect={setPaymentMethod}
                  />
                  <PaymentMethodTile
                    value="googlepay"
                    label="Google Pay"
                    iconUrl="https://www.mollie.com/external/icons/payment-methods/googlepay.svg"
                    selected={paymentMethod === "googlepay"}
                    onSelect={setPaymentMethod}
                  />
                  <PaymentMethodTile
                    value="bancontact"
                    label="Bancontact"
                    iconUrl="https://www.mollie.com/external/icons/payment-methods/bancontact.svg"
                    selected={paymentMethod === "bancontact"}
                    onSelect={setPaymentMethod}
                  />
                  <PaymentMethodTile
                    value="ideal"
                    label="iDEAL"
                    iconUrl="https://www.mollie.com/external/icons/payment-methods/ideal.svg"
                    selected={paymentMethod === "ideal"}
                    onSelect={setPaymentMethod}
                  />
                  <PaymentMethodTile
                    value="creditcard"
                    label={t("payment_method_card")}
                    iconUrl="https://www.mollie.com/external/icons/payment-methods/creditcard.svg"
                    selected={paymentMethod === "creditcard"}
                    onSelect={setPaymentMethod}
                  />
                  <PaymentMethodTile
                    value=""
                    label={t("payment_method_all")}
                    selected={paymentMethod === null || paymentMethod === ""}
                    onSelect={() => setPaymentMethod(null)}
                  />
                </div>
                <input
                  type="hidden"
                  name="paymentMethod"
                  value={paymentMethod ?? ""}
                />
              </fieldset>

              <button
                type="submit"
                disabled={isSubmitting || !shippable}
                className={cn(
                  "mt-6 flex h-12 w-full items-center justify-center bg-ink text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion",
                  (isSubmitting || !shippable) &&
                    "pointer-events-none opacity-60",
                )}
              >
                {isSubmitting ? t("cta_processing") : t("cta_pay")}
              </button>

              <p className="mt-3 text-center text-[10px] uppercase tracking-label text-ink-mid">
                {t("secured_by_mollie")}
              </p>
            </div>
          </aside>
        </div>
      </form>
    </section>
  );
}

// ────────── sub-components ──────────────────────────────────────────────

/**
 * One quick-pick tile in the payment-method picker. Click → onSelect(value).
 * Selected state is a vermilion border + ink fill on the label. We render
 * the brand icon from Mollie's public CDN — they license those for use
 * inside checkouts. The "All methods" tile has no icon and a generic label.
 */
function PaymentMethodTile({
  value,
  label,
  iconUrl,
  selected,
  onSelect,
}: {
  value: string;
  label: string;
  iconUrl?: string;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      className={cn(
        "flex h-14 items-center justify-center gap-2 border bg-white/60 px-3 transition-colors",
        selected
          ? "border-ink ring-1 ring-ink"
          : "border-ink/15 hover:border-ink/40",
      )}
    >
      {iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          width={32}
          height={20}
          className="h-5 w-auto"
        />
      )}
      <span className="text-[11px] uppercase tracking-label text-ink">
        {label}
      </span>
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-[20px] leading-tight text-ink md:text-[22px]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function AddressFields({
  prefix,
  defaults,
  fieldErrors,
  onCountryChange,
  t,
}: {
  prefix: "shipping" | "billing";
  defaults: CheckoutAddressDefaults | null;
  fieldErrors: Record<string, string>;
  onCountryChange?: (c: string) => void;
  t: (key: string) => string;
}) {
  const err = (k: string) => fieldErrors[`${prefix}.${k}`];
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={t("field_first_name")}
          name={`${prefix}.firstName`}
          defaultValue={defaults?.firstName ?? ""}
          required
          error={err("firstName")}
          autoComplete="given-name"
        />
        <Field
          label={t("field_last_name")}
          name={`${prefix}.lastName`}
          defaultValue={defaults?.lastName ?? ""}
          required
          error={err("lastName")}
          autoComplete="family-name"
        />
      </div>

      <Field
        label={t("field_company")}
        name={`${prefix}.company`}
        defaultValue={defaults?.company ?? ""}
        error={err("company")}
        autoComplete="organization"
      />

      {/* Shipping line1 gets Google Places autocomplete (#184) — the
          billing copy stays a plain Field because customers rarely
          type a different billing address from scratch. The picker
          writes back to the city/postcode/country fields by name when
          a suggestion is selected; without an API key it degrades
          gracefully to a plain input. */}
      {prefix === "shipping" ? (
        <AutocompleteLine1Field
          prefix={prefix}
          label={t("field_line1")}
          defaultValue={defaults?.line1 ?? ""}
          error={err("line1")}
          onCountryChange={onCountryChange}
        />
      ) : (
        <Field
          label={t("field_line1")}
          name={`${prefix}.line1`}
          defaultValue={defaults?.line1 ?? ""}
          required
          error={err("line1")}
          autoComplete="address-line1"
        />
      )}

      <Field
        label={t("field_line2")}
        name={`${prefix}.line2`}
        defaultValue={defaults?.line2 ?? ""}
        error={err("line2")}
        autoComplete="address-line2"
      />

      <div className="grid gap-5 md:grid-cols-3">
        <Field
          label={t("field_postcode")}
          name={`${prefix}.postcode`}
          defaultValue={defaults?.postcode ?? ""}
          required
          error={err("postcode")}
          autoComplete="postal-code"
        />
        <Field
          label={t("field_city")}
          name={`${prefix}.city`}
          defaultValue={defaults?.city ?? ""}
          required
          error={err("city")}
          className="md:col-span-2"
          autoComplete="address-level2"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={t("field_region")}
          name={`${prefix}.region`}
          defaultValue={defaults?.region ?? ""}
          error={err("region")}
          autoComplete="address-level1"
        />
        <Field
          label={t("field_country")}
          name={`${prefix}.country`}
          defaultValue={defaults?.country ?? "BE"}
          required
          maxLength={2}
          uppercase
          error={err("country")}
          hint={t("field_country_hint")}
          autoComplete="country"
          onChange={
            onCountryChange
              ? (e) => onCountryChange(e.target.value.toUpperCase())
              : undefined
          }
        />
      </div>

      <Field
        label={t("field_phone")}
        name={`${prefix}.phone`}
        defaultValue={defaults?.phone ?? ""}
        error={err("phone")}
        type="tel"
        autoComplete="tel"
      />
    </div>
  );
}

/**
 * AutocompleteLine1Field — wraps AddressAutocomplete inside the same
 * Field layout (label / error / placeholder) used elsewhere on the
 * form. When the user picks a Google suggestion we write the parsed
 * city / postcode / country / region into the sibling fields by name.
 *
 * We reach through `document` rather than lifting state because the
 * AddressFields tree is otherwise uncontrolled — promoting it to
 * controlled state for one feature would balloon the diff.
 */
function AutocompleteLine1Field({
  prefix,
  label,
  defaultValue,
  error,
  onCountryChange,
}: {
  prefix: "shipping" | "billing";
  label: string;
  defaultValue: string;
  error?: string;
  onCountryChange?: (c: string) => void;
}) {
  const errId = error ? `${prefix}-line1-err` : undefined;
  const inputClass = cn(
    "block w-full border bg-rice/40 px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-mid focus:outline-none focus:ring-1 focus:ring-ink/20",
    error ? "border-vermilion" : "border-ink/15",
  );
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      <AddressAutocomplete
        name={`${prefix}.line1`}
        defaultValue={defaultValue}
        required
        className={inputClass}
        onAddressPicked={(a) => {
          // Write to siblings by name. Each Field renders a unique
          // [name="<prefix>.<field>"] input — so we just update the
          // value via the native setter and dispatch an `input` event
          // to keep React's controlled-input invariant happy where
          // it applies.
          const set = (n: string, v: string) => {
            const el = document.querySelector<HTMLInputElement>(
              `[name="${prefix}.${n}"]`,
            );
            if (!el) return;
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value",
            )?.set;
            setter?.call(el, v);
            el.dispatchEvent(new Event("input", { bubbles: true }));
          };
          // Place the parsed line1 into our own input too — Google's
          // formatted text differs slightly from the typed search.
          set("line1", a.line1);
          set("city", a.city);
          set("postcode", a.postcode);
          if (a.region) set("region", a.region);
          // The country field is a <select>; updating its value via
          // the same path triggers React's onChange so the parent
          // pricing-preview reflects the new VAT/shipping zone.
          set("country", a.country);
          if (onCountryChange) onCountryChange(a.country);
        }}
      />
      {error && (
        <span id={errId} className="mt-1 block text-[11px] text-vermilion">
          {error}
        </span>
      )}
    </label>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  error,
  className,
  type = "text",
  maxLength,
  hint,
  uppercase,
  autoComplete,
  value,
  onChange,
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  error?: string;
  className?: string;
  type?: string;
  maxLength?: number;
  hint?: string;
  uppercase?: boolean;
  autoComplete?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
        {required && <span className="ml-1 text-vermilion">*</span>}
      </span>
      <input
        type={type}
        name={name}
        // Controlled only when caller passes `value` (coupon code + country
        // change). Otherwise uncontrolled with defaultValue — this avoids
        // re-rendering the whole form every keystroke in the address fields.
        {...(value !== undefined
          ? { value, onChange }
          : { defaultValue, onChange })}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className={cn(
          "w-full border bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:outline-none",
          error
            ? "border-vermilion focus:border-vermilion"
            : "border-ink/15 focus:border-ink",
          uppercase && "uppercase tracking-wide",
        )}
      />
      {error ? (
        <span className="mt-1.5 block text-[11px] text-vermilion">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[11px] text-ink-mid">{hint}</span>
      ) : null}
    </label>
  );
}

function Line({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string;
  hint?: string | null;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn("text-ink-mid", muted && "italic")}>{label}</span>
      <div className="text-right">
        <div
          className={cn(
            "tabular-nums",
            muted ? "text-[12px] text-ink-mid" : "text-ink",
          )}
        >
          {value}
        </div>
        {hint && (
          <div className="text-[10px] uppercase tracking-label text-ink-mid">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────── helpers ─────────────────────────────────────────────────────

function shippingReasonLabel(
  totals: PricingResult,
  // Wider signature so we can pass ICU placeholder values when needed
  // (e.g. summary_free_over_threshold uses {amount}). The next-intl
  // useTranslations() return type already supports the second arg.
  t: (key: string, values?: Record<string, string | number>) => string,
  shipping: ShippingSettings,
): string | null {
  switch (totals.shippingReason) {
    case "free_threshold":
      // ICU placeholder — pass {amount} via the second arg, NOT
      // .replace() on the result. With strict ICU, next-intl fails to
      // resolve the key when a declared placeholder isn't supplied,
      // falling back to the raw key path which then renders as
      // "checkout.summary_free_over_threshold" on the page.
      return t("summary_free_over_threshold", {
        amount: formatEur(shipping.freeThresholdCents / 100, "nl-BE"),
      });
    case "coupon_free_shipping":
      return t("summary_coupon_free_shipping");
    case "unshippable":
      return t("summary_unshippable_hint");
    default:
      return null;
  }
}
