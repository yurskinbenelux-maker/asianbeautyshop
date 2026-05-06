// ─────────────────────────────────────────────────────────────────────────
// Server-side cart helpers — cookie-bound, works for guests + logged-in.
//
// How it works:
//   1. Each browser has a `cart_token` HTTP-only cookie (UUID). On the
//      first write we mint one and create a matching Cart row.
//   2. Cart expiry rolls forward to +30 days on every mutation, so
//      active carts never get pruned while they're in use.
//   3. When a guest signs in later, you can merge their guest cart into
//      their user cart by handing the token to `claimCart(userId)` — not
//      implemented yet, but the schema supports it (Cart.userId is
//      nullable + `token` is unique).
//
// These helpers are called from Server Actions (lib/cart/actions.ts).
// Don't call them from client components — they touch cookies + Prisma.
// ─────────────────────────────────────────────────────────────────────────

// NOTE: `import "server-only"` would give us a build-time guard that this
// module is never bundled to the client. Not installed in this project
// yet — the fact that we touch `cookies()` and Prisma means it'd crash
// anyway if a client component imported it, so the guard is belt-and-
// braces rather than essential. Add via `npm i server-only` when you
// want the compile-time error.
import { cookies } from "next/headers";
import { Locale, Prisma, ProductKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CartSummary, CartItemView } from "./types";
import {
  isGiftCardConfig,
  type GiftCardConfig,
} from "@/lib/gift-cards/types";

const CART_COOKIE = "cart_token";
const CART_TTL_DAYS = 30;

/** Cookie options — HTTP-only, SameSite lax, secure in production. */
function cartCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_TTL_DAYS * 24 * 60 * 60, // seconds
  };
}

/** Tomorrow + N days, for Cart.expiresAt. */
function rolledExpiry(): Date {
  return new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// ──────── core resolver ──────────────────────────────────────────────────

/**
 * Find the current cart (via cookie) or create a new one. Always sets the
 * cookie so the next request is cheap. Returns both the cart row and
 * whether it was freshly minted (useful for analytics / first-add events).
 */
export async function getOrCreateCart(opts?: {
  locale?: Locale;
}): Promise<{ id: string; token: string; locale: Locale; created: boolean }> {
  const jar = await cookies();
  const existingToken = jar.get(CART_COOKIE)?.value;

  if (existingToken) {
    const existing = await prisma.cart.findUnique({
      where: { token: existingToken },
      select: { id: true, token: true, locale: true, expiresAt: true },
    });
    // Treat an expired cart as missing — fall through to create a fresh one.
    if (existing && existing.expiresAt > new Date()) {
      return {
        id: existing.id,
        token: existing.token,
        locale: existing.locale,
        created: false,
      };
    }
  }

  // Mint a new cart. We use crypto.randomUUID — it's good enough as a
  // bearer token because the cookie is HTTP-only and scoped to this site.
  const token = crypto.randomUUID();
  const cart = await prisma.cart.create({
    data: {
      token,
      locale: opts?.locale ?? Locale.EN,
      currency: "EUR",
      expiresAt: rolledExpiry(),
    },
    select: { id: true, token: true, locale: true },
  });

  jar.set(CART_COOKIE, token, cartCookieOptions());
  return { id: cart.id, token: cart.token, locale: cart.locale, created: true };
}

/**
 * Best-effort read of the current cart WITHOUT creating one on miss.
 * Used by the layout to pre-render the header badge — it's fine for a
 * visitor who hasn't added anything yet to see a count of zero without
 * us writing a Cart row for them.
 */
export async function peekCartSummary(opts?: {
  locale?: Locale;
}): Promise<CartSummary> {
  const jar = await cookies();
  const token = jar.get(CART_COOKIE)?.value;
  if (!token) return emptyCart();

  const cart = await prisma.cart.findUnique({
    where: { token },
    select: { id: true, expiresAt: true },
  });
  if (!cart || cart.expiresAt <= new Date()) return emptyCart();

  return getCartSummary({
    cartId: cart.id,
    locale: opts?.locale ?? Locale.EN,
  });
}

// ──────── view model ─────────────────────────────────────────────────────

/**
 * Build the CartSummary view-model for a cart id + locale.
 * Resolves localised names/slugs + primary image in one query.
 */
export async function getCartSummary(args: {
  cartId: string;
  locale: Locale;
}): Promise<CartSummary> {
  const { cartId, locale } = args;

  const items = await prisma.cartItem.findMany({
    where: { cartId },
    orderBy: { createdAt: "asc" },
    include: {
      product: {
        select: {
          id: true,
          kind: true,
          volumeMl: true,
          translations: {
            where: { locale },
            select: { name: true, slug: true },
            take: 1,
          },
          // fall back to EN if the active locale has no translation yet
          // (admin is still filling in NL/FR/RU). This keeps carts functional
          // mid-translation.
          media: {
            where: { isPrimary: true },
            select: { url: true },
            take: 1,
          },
        },
      },
      variant: {
        select: { id: true, label: true, price: true },
      },
    },
  });

  // Second pass: fetch EN fallbacks for any product missing a translation
  // in the requested locale. Keeps the query count deterministic (max 2).
  const missingTranslation = items
    .filter((i) => i.product.translations.length === 0)
    .map((i) => i.product.id);

  let fallbackByProductId: Map<string, { name: string; slug: string }> =
    new Map();
  if (missingTranslation.length > 0 && locale !== Locale.EN) {
    const fallbacks = await prisma.productTranslation.findMany({
      where: {
        productId: { in: missingTranslation },
        locale: Locale.EN,
      },
      select: { productId: true, name: true, slug: true },
    });
    fallbackByProductId = new Map(
      fallbacks.map((t) => [t.productId, { name: t.name, slug: t.slug }]),
    );
  }

  const views: CartItemView[] = items.map((i) => {
    const translated = i.product.translations[0];
    const fallback = fallbackByProductId.get(i.product.id);
    const name = translated?.name ?? fallback?.name ?? "—";
    const slug = translated?.slug ?? fallback?.slug ?? "";

    const unitPriceEur = decimalToNumber(i.unitPrice);
    // The Json column comes back as `Prisma.JsonValue`. Run it through the
    // type guard so the client only ever sees a well-formed config (or null).
    const giftCardConfig = isGiftCardConfig(i.giftCardConfig)
      ? (i.giftCardConfig as GiftCardConfig)
      : null;
    return {
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      name,
      slug,
      imageUrl: i.product.media[0]?.url ?? null,
      volumeMl: i.product.volumeMl,
      variantLabel: i.variant?.label ?? null,
      unitPriceEur,
      quantity: i.quantity,
      lineTotalEur: round2(unitPriceEur * i.quantity),
      giftCardConfig,
      requiresShipping: i.product.kind !== ProductKind.GIFT_CARD,
      // Carry the per-line discount markers through to the view-model
      // so the cart UI can render the strikethrough + −15% chip and the
      // pricing engine can compute the discount + reject coupon codes.
      discountReason: i.discountReason ?? null,
      discountPercent: i.discountPercent ?? null,
    };
  });

  const subtotalEur = round2(
    views.reduce((sum, v) => sum + v.lineTotalEur, 0),
  );
  const itemCount = views.reduce((n, v) => n + v.quantity, 0);

  return {
    id: cartId,
    itemCount,
    lineCount: views.length,
    subtotalEur,
    currency: "EUR",
    items: views,
  };
}

// ──────── mutations (all callable from Server Actions) ──────────────────

/** Add N units of a product (or variant) to the current cart. */
export async function addItem(args: {
  productId: string;
  variantId?: string | null;
  quantity?: number;
  locale?: Locale;
  /**
   * Required when the product is a GIFT_CARD. Each gift-card line carries
   * its own recipient details so two cards going to two friends can't
   * collapse onto a single cart line. Standard products MUST omit this.
   */
  giftCardConfig?: GiftCardConfig | null;
}): Promise<CartSummary> {
  const quantity = Math.max(1, Math.floor(args.quantity ?? 1));
  const locale = args.locale ?? Locale.EN;

  // Get product + variant price in one shot so we can snapshot unitPrice
  // at add-to-cart time (what the customer saw). Also pull `kind` so we
  // know whether to expect a gift-card config payload, and the sale flags
  // so we can apply the discount on the line.
  const product = await prisma.product.findFirst({
    where: { id: args.productId, deletedAt: null, status: "PUBLISHED" },
    select: {
      id: true,
      kind: true,
      price: true,
      isOnSale: true,
      salePercent: true,
      variants: args.variantId
        ? {
            where: { id: args.variantId },
            select: { id: true, price: true },
            take: 1,
          }
        : undefined,
    },
  });
  if (!product) {
    throw new Error("Product not available.");
  }

  const isGiftCard = product.kind === ProductKind.GIFT_CARD;

  // Validate the recipient payload shape for gift cards. Reject silently
  // for standard products if a config slipped through — better to ignore
  // than to litter unrelated rows with stale data.
  let configToPersist: GiftCardConfig | null = null;
  if (isGiftCard) {
    if (!args.giftCardConfig || !isGiftCardConfig(args.giftCardConfig)) {
      throw new Error("Gift card recipient is required.");
    }
    configToPersist = args.giftCardConfig;
  }

  const variantPrice =
    args.variantId && product.variants?.[0]?.price
      ? product.variants[0].price
      : null;
  const regularUnitPrice: Prisma.Decimal = variantPrice ?? product.price;

  // Apply Product.isOnSale + salePercent on top of the (variant or
  // product) base price. The variant inherits the product's sale state —
  // there's no per-variant override today; if Sofia ever wants one, we
  // add isOnSale/salePercent to ProductVariant and read here.
  let unitPrice: Prisma.Decimal = regularUnitPrice;
  let lineDiscountReason: string | null = null;
  let lineDiscountPercent: number | null = null;
  if (product.isOnSale && product.salePercent && product.salePercent > 0) {
    const pct = Math.min(90, Math.max(0, product.salePercent));
    // Snap to cents — Prisma Decimal preserves precision but we want a
    // clean €X.XX on the cart line.
    const discounted = Number(regularUnitPrice) * (1 - pct / 100);
    unitPrice = new Prisma.Decimal(Math.round(discounted * 100) / 100);
    lineDiscountReason = "sale";
    lineDiscountPercent = pct;
  }

  const cart = await getOrCreateCart({ locale });

  // Standard products: bump quantity if the same (productId, variantId)
  // pair is already in the cart so the customer doesn't see two identical
  // lines after a double-click.
  //
  // Gift cards: each line is unique (different recipient, message). We
  // always create a fresh row, even when the denomination matches.
  if (!isGiftCard) {
    const existing = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: args.productId,
        variantId: args.variantId ?? null,
        // Only match rows without a gift-card config — never collapse a
        // standard line onto a gift-card line, even if the (product,
        // variant) pair somehow matches.
        giftCardConfig: { equals: Prisma.DbNull },
      },
      select: { id: true, quantity: true },
    });

    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: args.productId,
          variantId: args.variantId ?? null,
          quantity,
          unitPrice,
          // Sale flags — set when the product was on sale at add time.
          // The pricing engine uses `discountReason` to refuse coupons
          // on this line (mirrors quiz-reward behaviour) and the cart
          // UI can render a "−X%" chip from `discountPercent`.
          discountReason: lineDiscountReason,
          discountPercent: lineDiscountPercent,
        },
      });
    }
  } else {
    // Gift card — always a fresh line, quantity forced to 1 so each card
    // gets its own recipient/message. If the customer wants two €50 cards
    // for two different people, that's two lines.
    // (Gift cards aren't currently put on sale via the standard sale
    // flags, but if Sofia ever toggles isOnSale on a GIFT_CARD product
    // the discount flows through here too.)
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: args.productId,
        variantId: args.variantId ?? null,
        quantity: 1,
        unitPrice,
        discountReason: lineDiscountReason,
        discountPercent: lineDiscountPercent,
        giftCardConfig:
          configToPersist as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // Roll the expiry so active carts stay alive.
  await prisma.cart.update({
    where: { id: cart.id },
    data: { expiresAt: rolledExpiry(), locale },
  });

  return getCartSummary({ cartId: cart.id, locale });
}

/** Set the quantity on one line. Quantity 0 removes the line. */
export async function updateItemQuantity(args: {
  cartItemId: string;
  quantity: number;
  locale?: Locale;
}): Promise<CartSummary> {
  const locale = args.locale ?? Locale.EN;
  const qty = Math.max(0, Math.floor(args.quantity));

  const item = await prisma.cartItem.findUnique({
    where: { id: args.cartItemId },
    select: { cartId: true },
  });
  if (!item) return emptyCart();

  if (qty === 0) {
    await prisma.cartItem.delete({ where: { id: args.cartItemId } });
  } else {
    await prisma.cartItem.update({
      where: { id: args.cartItemId },
      data: { quantity: qty },
    });
  }

  await prisma.cart.update({
    where: { id: item.cartId },
    data: { expiresAt: rolledExpiry() },
  });

  return getCartSummary({ cartId: item.cartId, locale });
}

/** Remove a line outright. Equivalent to updateItemQuantity(0). */
export async function removeItem(args: {
  cartItemId: string;
  locale?: Locale;
}): Promise<CartSummary> {
  return updateItemQuantity({
    cartItemId: args.cartItemId,
    quantity: 0,
    locale: args.locale,
  });
}

/** Clear the whole cart. Currently unused by the UI — kept for tests/admin. */
export async function clearCart(cartId: string): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { cartId } });
  await prisma.cart.update({
    where: { id: cartId },
    data: { expiresAt: rolledExpiry() },
  });
}

// ──────── helpers ────────────────────────────────────────────────────────

function decimalToNumber(d: Prisma.Decimal): number {
  // Prisma.Decimal has toNumber() but we go through toString for safety
  // with values that might exceed Number.MAX_SAFE_INTEGER (unlikely for
  // retail prices, but cheap insurance).
  return Number(d.toString());
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyCart(): CartSummary {
  return {
    id: "",
    itemCount: 0,
    lineCount: 0,
    subtotalEur: 0,
    currency: "EUR",
    items: [],
  };
}
