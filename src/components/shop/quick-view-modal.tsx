// ─────────────────────────────────────────────────────────────────────────
// QuickViewModal — preview overlay launched from the shop grid.
//
// Intentionally minimal: the full PDP is one click away, so the modal
// just surfaces the signals a shopper needs to decide "is this for me?"
//   · hero image
//   · brand + name + tagline
//   · price (with strike-through sale price)
//   · add-to-ritual CTA
//   · "View full product" link
//
// Keyboard + screen-reader friendly:
//   · ESC closes
//   · Focus-visible outline on the close button
//   · Backdrop click closes (aria-hidden backdrop; clicks bubble via onClick)
//   · role="dialog" + aria-modal on the panel
//
// Framer Motion drives the fade/scale entry — subtle, not theatrical.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { AddToRitualButton } from "@/components/shop/add-to-ritual-button";
import type { ProductCardData } from "@/lib/queries/products";
import { formatEur, priceLocale } from "@/lib/utils";

type Props = {
  product: ProductCardData | null;
  locale: string;
  onClose: () => void;
};

export function QuickViewModal({ product, locale, onClose }: Props) {
  // ESC to close. Scoped by a `product` check so the listener only
  // binds when the modal is actually open.
  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [product, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!product) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [product]);

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* backdrop */}
          <div
            aria-hidden
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          />

          {/* panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-view-title"
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 grid w-full max-w-3xl grid-cols-1 overflow-hidden bg-rice shadow-2xl md:grid-cols-2"
          >
            <QuickViewBody product={product} locale={locale} />

            <button
              type="button"
              onClick={onClose}
              aria-label="Close quick view"
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-rice/80 text-ink-mid backdrop-blur transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-vermilion"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function QuickViewBody({
  product,
  locale,
}: {
  product: ProductCardData;
  locale: string;
}) {
  const t = useTranslations("product");
  const currencyLocale = priceLocale(locale);
  const onSale =
    product.comparePriceEur !== null &&
    product.comparePriceEur > product.priceEur;

  return (
    <>
      {/* image */}
      <div className="relative aspect-[4/5] bg-rice-dim md:aspect-auto">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.imageAlt ?? product.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="font-kr text-[32px] text-ink-mid">Asian Beauty Shop</span>
          </div>
        )}
      </div>

      {/* info */}
      <div className="flex flex-col justify-between gap-8 p-8 md:p-10">
        <div>
          <h2
            id="quick-view-title"
            className="font-display text-display-sm leading-tight text-ink"
          >
            {product.name}
          </h2>
          {product.tagline && (
            <p className="mt-3 text-[14px] leading-relaxed text-ink-mid">
              {product.tagline}
            </p>
          )}

          <div className="rule my-6" />

          <div className="flex items-baseline gap-3">
            <span className="font-display text-[22px] text-ink">
              {formatEur(product.priceEur, currencyLocale)}
            </span>
            {onSale && product.comparePriceEur !== null && (
              <span className="text-[13px] text-ink-mid line-through">
                {formatEur(product.comparePriceEur, currencyLocale)}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {/*
            Quick-view is deliberately minimal — no variant picker, no
            gift-card recipient form, no stock-aware fallback. So we can
            only safely offer one-tap "Add to cart" when the product is
            (a) a regular product, (b) has zero or one variant, AND
            (c) actually has stock. Anything else → bounce the customer
            to the full PDP where the proper form lives, so we never
            "succeed" a click that the cart silently rejects.
          */}
          {product.kind === "GIFT_CARD" ? (
            <Link
              href={`/shop/${product.slug}`}
              className="flex h-12 w-full items-center justify-center bg-ink text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion"
            >
              {t("quick_personalise_gift_card")}
            </Link>
          ) : !product.isInStock ? (
            <Link
              href={`/shop/${product.slug}`}
              className="flex h-12 w-full items-center justify-center border border-ink/30 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-ink/5"
            >
              {t("quick_notify_when_back")}
            </Link>
          ) : product.hasOptions ? (
            <Link
              href={`/shop/${product.slug}`}
              className="flex h-12 w-full items-center justify-center bg-ink text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion"
            >
              {t("quick_choose_options")}
            </Link>
          ) : (
            <AddToRitualButton productId={product.id} sku={product.sku} />
          )}
          <Link
            href={`/shop/${product.slug}`}
            className="flex h-12 w-full items-center justify-center border border-ink/20 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink"
          >
            {t("view_full")}
          </Link>
        </div>
      </div>
    </>
  );
}
