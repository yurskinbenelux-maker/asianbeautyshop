// ─────────────────────────────────────────────────────────────────────────
// ProductPurchase — the variant selector + price row + add-to-ritual CTA.
//
// Why combine them: the price display depends on which variant is
// selected (variant may have its own price override), and the CTA needs
// to know the chosen variantId. Bundling them in one client component
// keeps state local and avoids prop-drilling a setter back up.
//
// When a product has no variants (or only a single "default"), we still
// render the button — we just hide the selector. That's the common case
// for products that only ship in one size.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Locale } from "@prisma/client";
import { useCart } from "@/components/cart/cart-provider";
import { cn, formatEur } from "@/lib/utils";
import type { PdpVariant } from "@/lib/queries/pdp";
import { BackInStockForm } from "./back-in-stock-form";

/** URL locale ("en") → Prisma Locale enum ("EN"). Defensive — falls back
 *  to EN if the runtime ever surfaces something we don't recognise. */
function toPrismaLocale(urlLocale: string): Locale {
  switch (urlLocale.toLowerCase()) {
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

type Props = {
  productId: string;
  sku: string;
  /** Base product price — used when the product has no variants at all. */
  basePriceEur: number;
  baseComparePriceEur: number | null;
  /** Net volume in millilitres — shown as a "Volume · 50 ml" line under
   *  the price. Always rendered when set, regardless of whether the
   *  product has variants. */
  volumeMl: number | null;
  /** Net weight in grams — same render slot as volumeMl, used as a
   *  fallback for solid products (powders, balms). When BOTH are set,
   *  volumeMl wins. */
  weightGrams: number | null;
  /** Currency formatting locale, e.g. "nl-BE". */
  currencyLocale: string;
  /** All variants for the product. Empty array = no variant selector. */
  variants: PdpVariant[];
  /**
   * Signed-in customer's email. Passed straight through to BackInStockForm
   * so logged-in users can subscribe to a back-in-stock notification with
   * a single tap, instead of retyping their email.
   */
  customerEmail?: string | null;
};

export function ProductPurchase({
  productId,
  sku,
  basePriceEur,
  baseComparePriceEur,
  volumeMl,
  weightGrams,
  currencyLocale,
  variants,
  customerEmail,
}: Props) {
  const t = useTranslations("product");
  const tCart = useTranslations("cart");
  const urlLocale = useLocale();
  const prismaLocale = toPrismaLocale(urlLocale);
  const { addItem } = useCart();
  const [, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Pick the initial variant: admin-marked default → first in stock →
  // first in the list. Falls back to null if there are no variants,
  // which is how we tell the CTA to add the plain product.
  const pickInitial = (): string | null => {
    if (variants.length === 0) return null;
    const def = variants.find((v) => v.isDefault);
    if (def) return def.id;
    const firstInStock = variants.find((v) => v.isInStock);
    if (firstInStock) return firstInStock.id;
    return variants[0].id;
  };
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    pickInitial,
  );

  // Resolve what the selector currently points at. If the product has
  // no variants, we synthesise a "phantom" from the base price so the
  // price row still renders cleanly.
  const activeVariant =
    variants.find((v) => v.id === selectedVariantId) ?? null;

  // ── Phase 2: two-axis (Volume + Type) detection ──────────────────
  //
  // A product qualifies for the two-axis layout when its variants
  // carry MORE than one distinct non-null volumeMl. If every variant
  // shares the same volume (or none have one set), we stay in the
  // single-Type-selector layout from Phase 1.
  //
  // The selector logic:
  //   · `availableVolumes` = sorted list of distinct volumeMl values
  //   · The active volume = the selected variant's volumeMl (or the
  //     first non-null when there's no selection yet)
  //   · `variantsForActiveVolume` = filter to variants matching the
  //     active volume → these are what Type buttons render
  //   · Clicking a Volume button reselects to the first in-stock
  //     variant at that size; clicking a Type button reselects
  //     directly to that variant
  //
  // Cart payload doesn't change — only `variantId` ever leaves this
  // component. Downstream code (cart action, Mollie, Sendcloud) sees
  // a single variantId, same as before.
  const distinctVolumes = Array.from(
    new Set(
      variants
        .map((v) => v.volumeMl)
        .filter((v): v is number => v !== null && v > 0),
    ),
  ).sort((a, b) => a - b);
  const isTwoAxis = distinctVolumes.length > 1;
  const activeVolume = activeVariant?.volumeMl ?? distinctVolumes[0] ?? null;
  const variantsForActiveVolume = isTwoAxis
    ? variants.filter((v) => v.volumeMl === activeVolume)
    : variants;

  const pickVolume = (ml: number) => {
    // Reselect to the first in-stock variant at that volume; if none
    // is in stock, fall back to the first one so the customer still
    // gets a clear "out of stock" signal rather than nothing selected.
    const matches = variants.filter((v) => v.volumeMl === ml);
    if (matches.length === 0) return;
    const inStock = matches.find((v) => v.isInStock);
    setSelectedVariantId((inStock ?? matches[0]).id);
  };

  const priceEur = activeVariant?.priceEur ?? basePriceEur;
  const compareEur = activeVariant?.comparePriceEur ?? baseComparePriceEur;
  const isInStock = activeVariant ? activeVariant.isInStock : true;
  // If a stock level is low but > 0, we flag it on the CTA area so the
  // customer knows to act. "Low" = 5 or fewer; feels right for a boutique.
  const isLow =
    activeVariant !== null &&
    activeVariant.isInStock &&
    activeVariant.stock <= 5;

  const onAdd = () => {
    if (!isInStock) return;
    setIsAdding(true);
    startTransition(async () => {
      try {
        await addItem({
          productId,
          variantId: activeVariant?.id ?? null,
          quantity: 1,
        });
        setJustAdded(true);
        toast.success(tCart("added_toast"));
        window.setTimeout(() => setJustAdded(false), 2000);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : tCart("add_failed"),
        );
      } finally {
        setIsAdding(false);
      }
    });
    console.debug("[cart:add]", {
      productId,
      sku,
      variantId: activeVariant?.id,
    });
  };

  return (
    <div>
      {/* ── price row ──────────────────────────────────────────── */}
      <div className="flex items-baseline gap-4">
        {compareEur && compareEur > priceEur && (
          <span className="text-[15px] text-ink-mid line-through">
            {formatEur(compareEur, currencyLocale)}
          </span>
        )}
        <span className="font-display text-[28px] text-ink">
          {formatEur(priceEur, currencyLocale)}
        </span>
      </div>

      {/* ── volume / weight label ──────────────────────────────
          Single-volume products show the product-level volume/weight
          as a static line here. In two-axis mode (multiple distinct
          variant volumes) we SKIP this line and let the Volume
          selector below carry the same information interactively —
          otherwise the same "50 ml" appears twice (label + first
          selector button). Liquids win when both are set. */}
      {!isTwoAxis && (volumeMl || weightGrams) && (
        <p className="mt-3 text-[12px] uppercase tracking-label text-ink-mid">
          {volumeMl
            ? `${t("volume")} · ${volumeMl} ml`
            : `${t("weight")} · ${weightGrams} g`}
        </p>
      )}

      {/* ── Volume selector (Phase 2 — only when variants differ) ──
          Renders ONLY when the product's variants carry more than
          one distinct non-null volumeMl. Clicking a Volume button
          reselects to the first in-stock variant at that size; the
          Type selector below then narrows to variants matching the
          new active volume. Cart still receives a single variantId
          — this UI is purely client-side resolution of the (Volume,
          Type) pair into one row. */}
      {isTwoAxis && (
        <fieldset className="mt-8">
          <legend className="mb-3 text-[11px] uppercase tracking-label text-ink-mid">
            {t("volume")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {distinctVolumes.map((ml) => {
              const active = ml === activeVolume;
              // Disable a Volume button when EVERY variant at that
              // size is out of stock — same UX as a stock-out Type
              // button. We still allow clicking so the customer can
              // confirm + see "Out of stock" message below.
              const anyInStock = variants.some(
                (v) => v.volumeMl === ml && v.isInStock,
              );
              return (
                <button
                  key={ml}
                  type="button"
                  onClick={() => pickVolume(ml)}
                  aria-pressed={active}
                  className={cn(
                    "relative min-w-[80px] border px-4 py-2 text-[12px] uppercase tracking-label transition-colors",
                    active
                      ? "border-ink bg-ink text-rice"
                      : "border-ink/20 bg-white text-ink hover:border-ink/40",
                    !anyInStock &&
                      "text-ink-mid line-through opacity-60",
                  )}
                >
                  {ml} ml
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* ── Type selector (shade / scent / finish) ─────────────
          In single-axis mode shows every variant. In two-axis mode
          shows ONLY variants matching the active Volume — that's
          what makes (Volume, Type) resolve cleanly to a single
          variantId. */}
      {variantsForActiveVolume.length > 1 && (
        <fieldset className={isTwoAxis ? "mt-6" : "mt-8"}>
          <legend className="mb-3 text-[11px] uppercase tracking-label text-ink-mid">
            {t("type_label")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {variantsForActiveVolume.map((v) => {
              const active = v.id === selectedVariantId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVariantId(v.id)}
                  disabled={!v.isInStock}
                  aria-pressed={active}
                  className={cn(
                    "relative min-w-[80px] border px-4 py-2 text-[12px] uppercase tracking-label transition-colors",
                    active
                      ? "border-ink bg-ink text-rice"
                      : "border-ink/20 bg-white text-ink hover:border-ink/40",
                    !v.isInStock &&
                      "cursor-not-allowed text-ink-mid line-through opacity-60 hover:border-ink/20",
                  )}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* ── stock signal (out / low) ──────────────────────────── */}
      {/* Lifted out of the variant fieldset so single-SKU products
          (one variant, no selector) also surface the urgency. We only
          render when there's an activeVariant — products with no
          variant rows have no stock concept and stay silent. */}
      {activeVariant && (
        <>
          {!isInStock && (
            <p className="mt-6 text-[12px] uppercase tracking-label text-ink-mid">
              {t("out_of_stock")}
            </p>
          )}
          {isInStock && isLow && (
            <p className="mt-6 text-[12px] uppercase tracking-label text-vermilion">
              {t("low_stock", { count: activeVariant.stock })}
            </p>
          )}
        </>
      )}

      {/* ── CTA — add to cart, OR back-in-stock signup ──────────── */}
      {/* When the active variant has stock, show the standard add-to-cart
          button. When it's out of stock AND we have a variantId (we always
          do here, since !isInStock implies activeVariant exists per the
          stock-signal block above), swap the disabled CTA for the
          back-in-stock email capture — same height so layout doesn't jump. */}
      <div className="mt-8">
        {isInStock ? (
          <button
            type="button"
            onClick={onAdd}
            aria-live="polite"
            disabled={isAdding}
            className={cn(
              "group relative inline-flex h-14 w-full items-center justify-center overflow-hidden text-[13px] uppercase tracking-label transition-colors",
              justAdded
                ? "bg-ink/90 text-rice"
                : isAdding
                  ? "bg-ink/80 text-rice"
                  : "bg-ink text-rice hover:bg-vermilion",
            )}
          >
            <span className="relative z-10 inline-flex items-center gap-2">
              {justAdded ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {tCart("added_inline")}
                </>
              ) : isAdding ? (
                <>
                  <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-rice/70" />
                  {tCart("adding")}
                </>
              ) : (
                t("add_to_ritual")
              )}
            </span>
          </button>
        ) : activeVariant ? (
          <BackInStockForm
            variantId={activeVariant.id}
            locale={prismaLocale}
            customerEmail={customerEmail}
          />
        ) : (
          // Defensive: no variant + out of stock shouldn't occur (no
          // variant means no stock concept) but keep a quiet message
          // rather than rendering nothing.
          <p className="text-[13px] text-ink-mid">{t("out_of_stock")}</p>
        )}
      </div>
    </div>
  );
}
