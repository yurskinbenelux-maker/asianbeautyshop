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
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { cn, formatEur } from "@/lib/utils";
import type { PdpVariant } from "@/lib/queries/pdp";

type Props = {
  productId: string;
  sku: string;
  /** Base product price — used when the product has no variants at all. */
  basePriceEur: number;
  baseComparePriceEur: number | null;
  /** Optional volume label shown next to the price (e.g. "50 ml"). */
  volumeMl: number | null;
  /** Currency formatting locale, e.g. "nl-BE". */
  currencyLocale: string;
  /** All variants for the product. Empty array = no variant selector. */
  variants: PdpVariant[];
};

export function ProductPurchase({
  productId,
  sku,
  basePriceEur,
  baseComparePriceEur,
  volumeMl,
  currencyLocale,
  variants,
}: Props) {
  const t = useTranslations("product");
  const tCart = useTranslations("cart");
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
        {volumeMl && !activeVariant && (
          <span className="text-[12px] uppercase tracking-label text-ink-mid">
            · {volumeMl} ml
          </span>
        )}
        {activeVariant && (
          <span className="text-[12px] uppercase tracking-label text-ink-mid">
            · {activeVariant.label}
          </span>
        )}
      </div>

      {/* ── variant selector (size / volume) ──────────────────── */}
      {variants.length > 1 && (
        <fieldset className="mt-8">
          <legend className="mb-3 text-[11px] uppercase tracking-label text-ink-mid">
            {t("size_label")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
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

      {/* ── add-to-ritual CTA ──────────────────────────────────── */}
      <div className="mt-8">
        <button
          type="button"
          onClick={onAdd}
          aria-live="polite"
          disabled={!isInStock || isAdding}
          className={cn(
            "group relative inline-flex h-14 w-full items-center justify-center overflow-hidden text-[13px] uppercase tracking-label transition-colors",
            !isInStock
              ? "cursor-not-allowed bg-ink/20 text-rice"
              : justAdded
                ? "bg-ink/90 text-rice"
                : isAdding
                  ? "bg-ink/80 text-rice"
                  : "bg-ink text-rice hover:bg-vermilion",
          )}
        >
          <span className="relative z-10 inline-flex items-center gap-2">
            {!isInStock ? (
              t("out_of_stock")
            ) : justAdded ? (
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
      </div>
    </div>
  );
}
