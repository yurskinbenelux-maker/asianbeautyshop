// ─────────────────────────────────────────────────────────────────────────
// BestsellerCard — single product tile on the homepage grid.
//
// Client component because Framer Motion needs the client boundary.
// Data comes in as a plain object from the server component wrapper,
// so this file never touches Prisma directly.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import type { ProductCardData } from "@/lib/queries/products";
import { formatEur, priceLocale } from "@/lib/utils";

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
          <div className="absolute left-4 top-4 font-kr text-[12px] text-ink-mid">
            {label}
          </div>
          {product.isFeatured && (
            <div className="seal absolute right-4 top-4" aria-label="Featured">
              ★
            </div>
          )}

          {/* Quick-view trigger — desktop: fades in on hover from the
              bottom; mobile: always visible (hover doesn't exist). The
              button stops the Link click so the modal opens in place. */}
          {onQuickView && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickView(product);
              }}
              className="absolute inset-x-4 bottom-4 z-10 flex h-10 items-center justify-center bg-rice/95 text-[11px] uppercase tracking-label text-ink opacity-100 transition-all duration-300 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
              aria-label={`${t("quick_view")}: ${product.name}`}
            >
              {t("quick_view")}
            </button>
          )}

          {product.imageUrl ? (
            // Once Sofia uploads real photography via admin → Supabase Storage,
            // this branch renders. Until then the SVG fallback below shows.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.imageAlt ?? product.name}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading={index === 0 ? "eager" : "lazy"}
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

        {/* ── meta row ─────────────────────────────────────── */}
        <div className="mt-5 flex items-baseline justify-between gap-4">
          <div>
            <h3 className="font-display text-[20px] leading-tight text-ink">
              {product.name}
            </h3>
            {product.tagline && (
              <p className="mt-1 text-[13px] text-ink-mid">{product.tagline}</p>
            )}
          </div>
          <div className="flex flex-col items-end whitespace-nowrap">
            {product.comparePriceEur &&
              product.comparePriceEur > product.priceEur && (
                <span className="text-[12px] text-ink-mid line-through">
                  {formatEur(product.comparePriceEur, priceLocale(locale))}
                </span>
              )}
            <span className="text-[15px] text-ink">
              {formatEur(product.priceEur, priceLocale(locale))}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
