// ─────────────────────────────────────────────────────────────────────────
// /[locale]/cart — client view
//
// The dedicated cart page (distinct from the slide-in drawer). Two-column
// on desktop: a list of line items on the left, a sticky order summary on
// the right. Stacks into a single column on mobile with the summary at
// the bottom.
//
// It reads/writes through the existing <CartProvider> (mounted in the
// locale layout) so that changes here propagate to the drawer, the badge,
// and vice-versa — one source of truth.
//
// Why a client component?
//   · The quantity +/- and remove controls are optimistic and want to
//     feel instant, which is what the provider already does for the drawer.
//   · The drawer and page share the same useCart() hook.
//
// The parent server page (page.tsx) handles metadata, request-locale,
// and delegates to this component.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { Link } from "@/i18n/routing";
import { useCart } from "@/components/cart/cart-provider";
import type { CartItemView } from "@/lib/cart/types";
import { cn, formatEur, priceLocale } from "@/lib/utils";

export function CartPageView() {
  const t = useTranslations("cart");
  const locale = useLocale();
  const currencyLocale = priceLocale(locale);
  const { cart, isPending, lastError } = useCart();

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

      {cart.items.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="grid gap-12 lg:grid-cols-[1fr_360px] lg:gap-16">
          {/* ── Items column ─────────────────────────────────────── */}
          <div>
            <ul className="divide-y divide-ink/10 border-t border-ink/10">
              {cart.items.map((item) => (
                <CartRow
                  key={item.id}
                  item={item}
                  currencyLocale={currencyLocale}
                />
              ))}
            </ul>

            <div className="mt-8">
              <Link
                href="/shop"
                className="inline-flex items-center text-[12px] uppercase tracking-label text-ink-mid underline decoration-vermilion/40 underline-offset-8 transition-colors hover:text-vermilion"
              >
                ← {t("continue_link")}
              </Link>
            </div>
          </div>

          {/* ── Summary column ───────────────────────────────────── */}
          <OrderSummary
            itemCount={cart.itemCount}
            subtotalEur={cart.subtotalEur}
            currencyLocale={currencyLocale}
            isPending={isPending}
            lastError={lastError}
          />
        </div>
      )}
    </section>
  );
}

// ────────── CartRow ─────────────────────────────────────────────────────

function CartRow({
  item,
  currencyLocale,
}: {
  item: CartItemView;
  currencyLocale: string;
}) {
  const t = useTranslations("cart");
  const { updateQty, removeLine } = useCart();

  return (
    <li className="flex gap-5 py-6 md:gap-8 md:py-8">
      {/* Thumbnail */}
      <Link
        href={`/shop/${item.slug}`}
        className="relative block h-28 w-24 shrink-0 overflow-hidden bg-ink/5 md:h-36 md:w-32"
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes="(min-width: 768px) 128px, 96px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-mid">
            <ShoppingBag className="h-6 w-6" aria-hidden />
          </div>
        )}
      </Link>

      {/* Text + controls */}
      <div className="flex flex-1 flex-col justify-between gap-4">
        <div>
          <Link
            href={`/shop/${item.slug}`}
            className="font-display text-[18px] leading-tight text-ink transition-colors hover:text-vermilion md:text-[20px]"
          >
            {item.name}
          </Link>

          {(item.variantLabel || item.volumeMl) && (
            <div className="mt-1.5 text-[11px] uppercase tracking-label text-ink-mid">
              {item.variantLabel ??
                (item.volumeMl ? `${item.volumeMl} ml` : "")}
            </div>
          )}

          <div className="mt-2 text-[13px] text-ink-mid">
            {formatEur(item.unitPriceEur, currencyLocale)}
          </div>
        </div>

        {/* Row of controls (stepper left, price + remove right) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <QuantityStepper
            value={item.quantity}
            onChange={(next) => updateQty(item.id, next)}
            decLabel={t("decrease")}
            incLabel={t("increase")}
          />

          <div className="flex items-center gap-4">
            <span className="font-display text-[18px] text-ink">
              {formatEur(item.lineTotalEur, currencyLocale)}
            </span>
            <button
              type="button"
              onClick={() => removeLine(item.id)}
              aria-label={t("remove")}
              className="text-ink-mid transition-colors hover:text-vermilion"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

// ────────── QuantityStepper ─────────────────────────────────────────────

function QuantityStepper({
  value,
  onChange,
  decLabel,
  incLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  decLabel: string;
  incLabel: string;
}) {
  return (
    <div className="inline-flex items-center border border-ink/15">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label={decLabel}
        className="flex h-10 w-10 items-center justify-center text-ink-mid transition-colors hover:text-ink"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="w-10 text-center text-[14px] tabular-nums text-ink">
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label={incLabel}
        className="flex h-10 w-10 items-center justify-center text-ink-mid transition-colors hover:text-ink"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ────────── OrderSummary ────────────────────────────────────────────────

function OrderSummary({
  itemCount,
  subtotalEur,
  currencyLocale,
  isPending,
  lastError,
}: {
  itemCount: number;
  subtotalEur: number;
  currencyLocale: string;
  isPending: boolean;
  lastError: string | null;
}) {
  const t = useTranslations("cart");

  return (
    <aside className="lg:sticky lg:top-32 lg:self-start">
      <div className="border border-ink/10 bg-white/60 p-6 md:p-8">
        <div className="eyebrow">{t("summary_title")}</div>
        <div className="mt-2 text-[13px] text-ink-mid">
          {t("summary_items", { count: itemCount })}
        </div>

        <div className="mt-6 space-y-3 text-[14px]">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-mid">{t("summary_subtotal")}</span>
            <span className="font-display text-[18px] text-ink">
              {formatEur(subtotalEur, currencyLocale)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-ink-mid">{t("summary_shipping")}</span>
            <span className="text-[13px] italic text-ink-mid">
              {t("summary_shipping_value")}
            </span>
          </div>
        </div>

        <div className="mt-5 border-t border-ink/10 pt-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] uppercase tracking-label text-ink-mid">
              {t("summary_total")}
            </span>
            <span className="font-display text-[24px] text-ink">
              {formatEur(subtotalEur, currencyLocale)}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-mid">
            {t("shipping_note")}
          </p>
        </div>

        {lastError && (
          <div className="mt-5 border border-vermilion/30 bg-vermilion/5 px-3 py-2 text-[12px] text-vermilion">
            {lastError}
          </div>
        )}

        {/* Checkout CTA — stubbed until Mollie is wired up (task #32) */}
        <Link
          href="/checkout"
          className={cn(
            "mt-6 flex h-12 items-center justify-center bg-ink text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion",
            isPending && "pointer-events-none opacity-60",
          )}
        >
          {t("checkout")}
        </Link>
      </div>
    </aside>
  );
}

// ────────── EmptyCart ───────────────────────────────────────────────────

function EmptyCart() {
  const t = useTranslations("cart");
  return (
    <div className="mx-auto max-w-lg border border-ink/10 bg-white/50 px-8 py-16 text-center">
      <div
        aria-hidden
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-ink/15 bg-white/60"
      >
        <ShoppingBag className="h-6 w-6 text-ink-mid" />
      </div>
      <div className="eyebrow mt-5">{t("empty_eyebrow")}</div>
      <h2 className="mt-3 font-display text-[26px] leading-tight text-ink">
        {t("empty_title")}
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-ink-mid">
        {t("empty_lede")}
      </p>
      <Link
        href="/shop"
        className="mt-7 inline-block h-11 bg-ink px-6 text-[12px] uppercase tracking-label leading-[2.75rem] text-rice transition-colors hover:bg-vermilion"
      >
        {t("empty_cta")}
      </Link>
    </div>
  );
}
