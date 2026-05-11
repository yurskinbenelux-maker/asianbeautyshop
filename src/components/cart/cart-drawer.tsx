// ─────────────────────────────────────────────────────────────────────────
// CartDrawer — slide-in cart, anchored to the right edge.
//
// Structure: overlay + fixed panel. Lives permanently in the layout so
// we get CSS transitions on open/close without mounting-on-click jank.
// Uses the CartContext for state.
//
// Accessibility:
//   · role="dialog" + aria-modal + aria-label
//   · Escape to close, focus trapped while open
//   · Scroll locked on <body> while open
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { X, Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/routing";
import { useCart } from "./cart-provider";
import { FreeShippingMeter } from "./free-shipping-meter";
import { cn, formatEur, priceLocale } from "@/lib/utils";

export function CartDrawer() {
  const t = useTranslations("cart");
  const locale = useLocale();
  const currencyLocale = priceLocale(locale);
  const {
    cart,
    isOpen,
    closeDrawer,
    isPending,
    lastError,
    freeShippingThresholdEur,
  } = useCart();

  const panelRef = useRef<HTMLDivElement>(null);

  // ── Escape key closes the drawer ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDrawer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeDrawer]);

  // ── Scroll-lock the body while the drawer is open ─────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  // ── Move focus into the panel when it opens ───────────────────────────
  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <>
      {/* Overlay — click anywhere outside the panel to close */}
      <div
        aria-hidden={!isOpen}
        onClick={closeDrawer}
        className={cn(
          "fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300",
          isOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("drawer_title")}
        aria-hidden={!isOpen}
        tabIndex={-1}
        className={cn(
          "fixed right-0 top-0 z-[60] flex h-dvh w-full max-w-md flex-col bg-rice shadow-[-8px_0_40px_rgba(18,17,16,0.08)] outline-none transition-transform duration-400",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="flex items-center justify-between border-b border-ink/10 px-6 py-5">
          <div>
            <div className="eyebrow">{t("eyebrow")}</div>
            <h2 className="mt-1 font-display text-[22px] leading-tight text-ink">
              {t("drawer_title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label={t("close")}
            className="flex h-9 w-9 items-center justify-center text-ink-mid transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {cart.items.length === 0 ? (
            <EmptyState onClose={closeDrawer} />
          ) : (
            <ul className="divide-y divide-ink/10">
              {cart.items.map((item) => (
                <CartLine
                  key={item.id}
                  item={item}
                  currencyLocale={currencyLocale}
                />
              ))}
            </ul>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────── */}
        {cart.items.length > 0 && (
          <footer
            className="space-y-4 border-t border-ink/10 px-6 py-5"
            // Lift the bottom padding above the iPhone home indicator
            // so the "Continue shopping" link isn't half-eaten by the
            // home bar. The base `py-5` provides 1.25rem on top + bottom;
            // we extend the bottom side with safe-area when present.
            style={{
              paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
            }}
          >
            {lastError && (
              <div className="rounded-none border border-vermilion/30 bg-vermilion/5 px-3 py-2 text-[12px] text-vermilion">
                {lastError}
              </div>
            )}

            {/* Free-shipping meter — surfaces just above the subtotal so
                the "€X to go" cue lands right where the customer is
                already looking at the price. Self-hides when the
                threshold is 0 (an admin disabled it in admin).

                We pass the ELIGIBLE subtotal (excludes gift cards) — a
                customer can't unlock free shipping by stacking gift
                cards. Threshold is for shippable products only. */}
            <FreeShippingMeter
              subtotalEur={cart.items
                .filter((i) => i.requiresShipping)
                .reduce((sum, i) => sum + i.lineTotalEur, 0)}
              thresholdEur={freeShippingThresholdEur}
            />

            <div className="flex items-baseline justify-between text-[13px]">
              <span className="uppercase tracking-label text-ink-mid">
                {t("subtotal")}
              </span>
              <span className="font-display text-[20px] text-ink">
                {formatEur(cart.subtotalEur, currencyLocale)}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-mid">
              {t("shipping_note")}
            </p>

            {/* Checkout CTA — stubbed until Mollie is wired up */}
            <Link
              href="/checkout"
              onClick={closeDrawer}
              className={cn(
                "flex h-12 items-center justify-center bg-ink text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion",
                isPending && "pointer-events-none opacity-60",
              )}
            >
              {t("checkout")}
            </Link>

            <button
              type="button"
              onClick={closeDrawer}
              className="block w-full text-center text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
            >
              {t("continue_shopping")}
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}

// ──────── CartLine ───────────────────────────────────────────────────────

function CartLine({
  item,
  currencyLocale,
}: {
  item: import("@/lib/cart/types").CartItemView;
  currencyLocale: string;
}) {
  const t = useTranslations("cart");
  const { updateQty, removeLine, closeDrawer } = useCart();

  return (
    <li className="flex gap-4 px-6 py-5">
      {/* Thumbnail */}
      <Link
        href={`/shop/${item.slug}`}
        onClick={closeDrawer}
        className="relative block h-24 w-20 shrink-0 overflow-hidden bg-ink/5"
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-mid">
            <ShoppingBag className="h-5 w-5" aria-hidden />
          </div>
        )}
      </Link>

      {/* Text + controls */}
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <Link
            href={`/shop/${item.slug}`}
            onClick={closeDrawer}
            className="font-display text-[15px] leading-tight text-ink transition-colors hover:text-vermilion"
          >
            {item.name}
          </Link>

          {(item.variantLabel || item.volumeMl) && (
            <div className="mt-1 text-[11px] uppercase tracking-label text-ink-mid">
              {item.variantLabel ??
                (item.volumeMl ? `${item.volumeMl} ml` : "")}
            </div>
          )}

          {/* Gift-card specific subtext: who's the card for? Sentinel
              "__buyer__" means the buyer hasn't told us yet (we'll stamp
              their email at checkout); show "for me" instead of an opaque
              token. */}
          {item.giftCardConfig && (
            <div className="mt-1 text-[11px] tracking-normal text-ink-mid">
              {item.giftCardConfig.deliveryMode === "self" ||
              item.giftCardConfig.recipientEmail === "__buyer__"
                ? t("gift_card_for_self")
                : t("gift_card_for_friend", {
                    name:
                      item.giftCardConfig.recipientName ||
                      item.giftCardConfig.recipientEmail,
                  })}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-mid">
            {/* Per-line discount visualisation — currently only the
                quiz reward (discountReason="quiz_reward", 15%). Show the
                original price struck through and the discounted price in
                vermilion, with a small −15% chip. */}
            {item.discountPercent && item.discountPercent > 0 ? (
              <>
                <span className="text-ink-mid/70 line-through">
                  {formatEur(item.unitPriceEur, currencyLocale)}
                </span>
                <span className="text-vermilion">
                  {formatEur(
                    item.unitPriceEur * (1 - item.discountPercent / 100),
                    currencyLocale,
                  )}
                </span>
                <span className="inline-flex items-center bg-vermilion px-1.5 py-0.5 text-[10px] uppercase tracking-label text-rice">
                  −{item.discountPercent}%
                </span>
              </>
            ) : (
              <span>{formatEur(item.unitPriceEur, currencyLocale)}</span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          {/* Gift cards have a fixed quantity of 1 — each line is a unique
              recipient. Hide the stepper to make that obvious. */}
          {item.giftCardConfig ? (
            <span className="text-[11px] uppercase tracking-label text-ink-mid">
              {t("gift_card_qty_one")}
            </span>
          ) : (
            <QuantityStepper
              value={item.quantity}
              onChange={(next) => updateQty(item.id, next)}
              decLabel={t("decrease")}
              incLabel={t("increase")}
            />
          )}

          <div className="flex items-center gap-3">
            {item.discountPercent && item.discountPercent > 0 ? (
              <div className="flex flex-col items-end leading-tight">
                <span className="text-[11px] text-ink-mid/70 line-through">
                  {formatEur(item.lineTotalEur, currencyLocale)}
                </span>
                <span className="font-display text-[15px] text-vermilion">
                  {formatEur(
                    item.lineTotalEur * (1 - item.discountPercent / 100),
                    currencyLocale,
                  )}
                </span>
              </div>
            ) : (
              <span className="font-display text-[15px] text-ink">
                {formatEur(item.lineTotalEur, currencyLocale)}
              </span>
            )}
            <button
              type="button"
              onClick={() => removeLine(item.id)}
              aria-label={t("remove")}
              className="text-ink-mid transition-colors hover:text-vermilion"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

// ──────── QuantityStepper ────────────────────────────────────────────────

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
        className="flex h-8 w-8 items-center justify-center text-ink-mid transition-colors hover:text-ink"
      >
        <Minus className="h-3 w-3" />
      </button>
      <div className="w-8 text-center text-[13px] tabular-nums text-ink">
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label={incLabel}
        className="flex h-8 w-8 items-center justify-center text-ink-mid transition-colors hover:text-ink"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

// ──────── EmptyState ─────────────────────────────────────────────────────

function EmptyState({ onClose }: { onClose: () => void }) {
  const t = useTranslations("cart");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full border border-ink/15 bg-white/50"
      >
        <ShoppingBag className="h-6 w-6 text-ink-mid" />
      </div>
      <div>
        <div className="eyebrow">{t("empty_eyebrow")}</div>
        <p className="mt-2 font-display text-[22px] leading-tight text-ink">
          {t("empty_title")}
        </p>
        <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ink-mid">
          {t("empty_lede")}
        </p>
      </div>
      <Link
        href="/shop"
        onClick={onClose}
        className="mt-2 inline-flex h-11 items-center px-6 text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 transition-colors hover:text-vermilion"
      >
        {t("empty_cta")}
      </Link>
    </div>
  );
}
