// ─────────────────────────────────────────────────────────────────────────
// BestsellerCard — single product tile on the homepage grid.
//
// Client component because Framer Motion needs the client boundary.
// Data comes in as a plain object from the server component wrapper,
// so this file never touches Prisma directly.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import type { ProductCardData } from "@/lib/queries/products";
import { cn, formatEur, priceLocale } from "@/lib/utils";

type Swatch = { tube: string; cap: string };

/** Three tube "looks" we rotate through when no real product photo exists. */
const SWATCHES: Swatch[] = [
  { tube: "#F8F4EC", cap: "#C8102E" }, // rice + vermilion
  { tube: "#C8102E", cap: "#121110" }, // vermilion + ink
  { tube: "#121110", cap: "#A78842" }, // ink + brass
];

export function BestsellerCard({
  product,
  index,
  locale,
  onQuickView,
}: {
  product: ProductCardData;
  index: number;
  locale: string;
  /**
   * When provided, the card renders a "Quick view" trigger that appears
   * on hover (desktop) / always (mobile). The handler receives the
   * current product so the parent can open its modal. Leaving this
   * undefined (e.g. on the homepage bestseller row) renders the card
   * without the trigger.
   */
  onQuickView?: (product: ProductCardData) => void;
}) {
  const swatch = SWATCHES[index % SWATCHES.length];
  const label = String(index + 1).padStart(2, "0");
  const t = useTranslations("product");

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay: index * 0.1 }}
      className="group"
    >
      <Link href={`/shop/${product.slug}`} className="block">
        {/* ── product image / SVG fallback ─────────────────── */}
        {/* view-transition-name pairs with the PDP hero so the image
            morphs smoothly between this card and the product page on
            click. The slug-based name is unique per-product per-page,
            which is what the API requires. Browsers without VT support
            ignore the property; the navigation still works normally. */}
        <div
          className="relative aspect-[4/5] overflow-hidden bg-rice-dim"
          style={{ viewTransitionName: `product-image-${product.slug}` }}
        >
          <div className="absolute left-2 top-2 font-kr text-[10px] text-ink-mid sm:left-4 sm:top-4 sm:text-[12px]">
            {label}
          </div>
          {product.isFeatured && (
            <div className="seal absolute right-2 top-2 sm:right-4 sm:top-4" aria-label="Featured">
              ★
            </div>
          )}

          {/* Quick-view trigger — desktop only. On mobile the card is
              now too narrow (~170 px) for a useful quick-view button
              AND the customer is one tap away from the PDP anyway, so
              we hide it under sm: instead of forcing it always-visible
              like before. */}
          {onQuickView && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickView(product);
              }}
              className="absolute inset-x-4 bottom-4 z-10 hidden h-10 items-center justify-center bg-rice/95 text-[11px] uppercase tracking-label text-ink opacity-0 transition-all duration-300 md:flex md:translate-y-2 md:group-hover:translate-y-0 md:group-hover:opacity-100"
              aria-label={`${t("quick_view")}: ${product.name}`}
            >
              {t("quick_view")}
            </button>
          )}

          {product.imageUrl ? (
            // next/image transcodes the Supabase PNG/JPG to AVIF on the
            // fly (per next.config images.formats). On a typical card we
            // ship ~40-60% fewer bytes than the original. `sizes` tells
            // the optimizer which variant to pick per breakpoint —
            // honoured by both AVIF and the fallback.
            <Image
              src={product.imageUrl}
              alt={product.imageAlt ?? product.name}
              fill
              priority={index === 0}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-end justify-center pb-10">
              <svg
                viewBox="0 0 120 320"
                className="h-[78%] transition-transform duration-500 group-hover:scale-105"
                aria-hidden
              >
                <rect
                  x="20"
                  y="60"
                  width="80"
                  height="220"
                  rx="4"
                  fill={swatch.tube}
                  stroke="#121110"
                  strokeWidth="1.2"
                />
                <rect
                  x="30"
                  y="20"
                  width="60"
                  height="40"
                  rx="2"
                  fill={swatch.cap}
                />
                <text
                  x="60"
                  y="180"
                  textAnchor="middle"
                  fill={swatch.tube === "#121110" ? "#F8F4EC" : "#121110"}
                  fontFamily="serif"
                  fontSize="14"
                  letterSpacing="2"
                >
                  YU.R
                </text>
              </svg>
            </div>
          )}
        </div>

        {/* ── social proof badges (#150) ──────────────────── */}
        {/* Bestseller pill is the highest-priority signal — only one
            shown per card to avoid badge clutter. Featured products
            without bestseller status get the editorial mark instead.
            Tighter top margin + smaller text on mobile so the meta
            block doesn't dominate a 170 px card. */}
        {(product.isBestseller || product.isFeatured) && (
          <p className="mt-2 text-[9px] uppercase tracking-label text-vermilion sm:mt-4 sm:text-[10px]">
            {product.isBestseller ? "Bestseller" : "Editor's pick"}
          </p>
        )}

        {/* ── meta row ─────────────────────────────────────── */}
        {/* Mobile: name/tagline/price stack vertically (gap too tight to
            fit them side-by-side at 170 px width). Desktop: original
            row layout with name left, price right. */}
        <div
          className={cn(
            "flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4",
            product.isBestseller || product.isFeatured ? "mt-1 sm:mt-2" : "mt-3 sm:mt-5",
          )}
        >
          <div className="min-w-0">
            <h3 className="font-display text-[14px] leading-tight text-ink sm:text-[20px]">
              {product.name}
            </h3>
            {product.tagline && (
              <p className="mt-0.5 hidden text-[11px] text-ink-mid sm:mt-1 sm:block sm:text-[13px]">
                {product.tagline}
              </p>
            )}
          </div>
          <div className="flex flex-row items-baseline gap-2 whitespace-nowrap sm:flex-col sm:items-end sm:gap-0">
            {product.comparePriceEur &&
              product.comparePriceEur > product.priceEur && (
                <span className="text-[10px] text-ink-mid line-through sm:text-[12px]">
                  {formatEur(product.comparePriceEur, priceLocale(locale))}
                </span>
              )}
            <span className="text-[13px] text-ink sm:text-[15px]">
              {formatEur(product.priceEur, priceLocale(locale))}
            </span>
          </div>
        </div>

        {/* ── rating row (#150) ──────────────────────────────
            Hidden on mobile — the card is too narrow to pair stars +
            count + "review/reviews" without wrapping. Customers still
            see ratings on the PDP and the bestseller badge above
            already signals social proof on the listing. */}
        {product.reviewCount > 0 && product.reviewAvg !== null && (
          <p className="mt-2 hidden items-center gap-1.5 text-[12px] text-ink-mid sm:flex">
            <span aria-hidden className="text-vermilion">
              ★
            </span>
            <span className="text-ink">
              {product.reviewAvg.toFixed(1)}
            </span>
            <span aria-hidden className="text-ink-mid/50">
              ·
            </span>
            <span>
              {product.reviewCount}{" "}
              {product.reviewCount === 1 ? "review" : "reviews"}
            </span>
          </p>
        )}
      </Link>
    </motion.div>
  );
}
