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
//      /checkout/success?order=YUR-… or /checkout/failure?…
//
// Why a plain <form action={...}> wasn't enough:
//   · We want to redirect to an external URL (Mollie) on success. Next's
//     server-action `redirect()` helper is for internal routes — external
//     redirects must be driven by the client, which is exactly what we do.
//   · We want inline field-error mapping without losing what the user
//     typed.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useMemo, useState, useTransition } from "react";
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

  // ── local state ────────────────────────────────────────────────────
  // The only reason we keep a shallow local state for country/subtotal is
  // so the Order Summary can update its shipping-free/flat-rate line and
  // VAT line as the user types — without re-roundtripping to the server.
  // All authoritative pricing still happens server-side in placeOrder().

  const [country, setCountry] = useState<string>(
    defaultAddress?.country ?? "BE",
  );
  const [couponCode, setCouponCode] = useState("");
  const [billingSame, setBillingSame] = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topLevelError, setTopLevelError] = useState<CheckoutErrorCode | null>(
    null,
  );
  const [isSubmitting, startTransition] = useTransition();

  // Client-side totals preview — intentionally without the coupon (coupons
  // are validated server-side only; hiding a potential discount on the
  // preview is safer than lying about one).
  const previewTotals = useMemo(
    () =>
      computeOrderTotals({
        cart,
        shippingCountry: country,
        coupon: null,
        shipping: shippingSettings,
        tax: taxSettings,
      }),
    [cart, country, shippingSettings, taxSettings],
  );

  // Fall back to the server's first-render totals before the user touches
  // country — avoids a flash of different numbers on mount.
  const totals: PricingResult =
    country === (defaultAddress?.country ?? "BE")
      ? initialTotals
      : previewTotals;

  // ── submit ─────────────────────────────────────────────────────────

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setTopLevelError(null);

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

            {/* Shipping address */}
            <Section title={t("section_shipping")}>
              <AddressFields
                prefix="shipping"
                defaults={defaultAddress}
                fieldErrors={fieldErrors}
                onCountryChange={setCountry}
                t={t}
              />
            </Section>

            {/* Billing same / different */}
            <Section title={t("section_billing")}>
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
            </Section>

            {/* Extras */}
            <Section title={t("section_extras")}>
              <Field
                label={t("field_coupon")}
                name="couponCode"
                defaultValue=""
                uppercase
                maxLength={40}
                value={couponCode}
                onChange={(e) =>
                  setCouponCode(e.target.value.toUpperCase().slice(0, 40))
                }
                hint={t("field_coupon_hint")}
              />
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

              {/* Line items */}
              <ul className="mt-5 space-y-4">
                {cart.items.map((item) => (
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
                    <div className="text-[13px] tabular-nums text-ink">
                      {formatEur(item.lineTotalEur, currencyLocale)}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-6 space-y-2.5 border-t border-ink/10 pt-5 text-[13px]">
                <Line
                  label={t("summary_subtotal")}
                  value={formatEur(totals.subtotalEur, currencyLocale)}
                />
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
                </div>
              )}

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

      <Field
        label={t("field_line1")}
        name={`${prefix}.line1`}
        defaultValue={defaults?.line1 ?? ""}
        required
        error={err("line1")}
        autoComplete="address-line1"
      />

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
  t: (key: string) => string,
  shipping: ShippingSettings,
): string | null {
  switch (totals.shippingReason) {
    case "free_threshold":
      return t("summary_free_over_threshold").replace(
        "{amount}",
        formatEur(shipping.freeThresholdCents / 100, "nl-BE"),
      );
    case "coupon_free_shipping":
      return t("summary_coupon_free_shipping");
    case "unshippable":
      return t("summary_unshippable_hint");
    default:
      return null;
  }
}
