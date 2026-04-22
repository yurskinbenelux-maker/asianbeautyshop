// ─────────────────────────────────────────────────────────────────────────
// Abandoned-cart eligibility query.
//
// A cart is eligible for a nudge when:
//   • it has items
//   • it has a linked user (so we have an email + name + locale)
//     — guest carts are skipped for now; we'd need a separate email-
//     capture step in checkout to reach those
//   • updatedAt is between MIN_HOURS and MAX_HOURS ago (default 4h–72h)
//   • lastAbandonEmailSentAt is null (never nudged)
//   • user has no order placed after the cart's updatedAt (if they
//     converted, no need to nudge)
//
// Returned rows carry just enough to render the reminder: cart id,
// user email/first-name/locale, and the top few line items.
//
// Migration note: this file references Cart.lastAbandonEmailSentAt which
// was added to schema.prisma. Run `pnpm prisma db push` (or migrate dev)
// to apply before hitting the cron endpoint.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ABANDON_MIN_HOURS = 4;
export const ABANDON_MAX_HOURS = 72;
export const ABANDON_BATCH_SIZE = 50;

export type AbandonedCartItem = {
  productName: string;
  quantity: number;
  imageUrl: string | null;
};

export type AbandonedCart = {
  cartId: string;
  email: string;
  firstName: string | null;
  locale: Locale;
  itemCount: number;
  totalItems: number;
  items: AbandonedCartItem[]; // up to 3
};

function hoursAgo(h: number): Date {
  const d = new Date();
  d.setTime(d.getTime() - h * 60 * 60 * 1000);
  return d;
}

/**
 * Find abandoned carts ready for a reminder email. Bounded batch.
 */
export async function findAbandonedCarts(
  batchSize: number = ABANDON_BATCH_SIZE,
): Promise<AbandonedCart[]> {
  const windowStart = hoursAgo(ABANDON_MAX_HOURS); // e.g. 72h ago
  const windowEnd = hoursAgo(ABANDON_MIN_HOURS); // e.g. 4h ago

  const carts = await prisma.cart.findMany({
    where: {
      lastAbandonEmailSentAt: null,
      userId: { not: null },
      updatedAt: { gte: windowStart, lte: windowEnd },
      // Must still have items — empty carts are no-ops.
      items: { some: {} },
    },
    orderBy: { updatedAt: "asc" },
    take: batchSize,
    select: {
      id: true,
      updatedAt: true,
      locale: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          preferredLocale: true,
          // If the user has an order placed AFTER this cart's updatedAt,
          // they probably converted on a different cart — we skip.
          orders: {
            select: { id: true, placedAt: true },
            orderBy: { placedAt: "desc" },
            take: 1,
          },
        },
      },
      items: {
        take: 3,
        orderBy: { createdAt: "asc" },
        select: {
          quantity: true,
          product: {
            select: {
              translations: {
                select: { locale: true, name: true },
              },
              media: {
                where: { isPrimary: true },
                select: { url: true },
                take: 1,
              },
            },
          },
          variant: { select: { label: true } },
        },
      },
      _count: { select: { items: true } },
    },
  });

  const results: AbandonedCart[] = [];
  for (const c of carts) {
    if (!c.user || !c.user.email) continue;

    // Skip if user placed any order *after* this cart's last touch.
    const latestOrderAt = c.user.orders[0]?.placedAt;
    if (latestOrderAt && latestOrderAt > c.updatedAt) continue;

    const locale = c.user.preferredLocale ?? c.locale;

    const items: AbandonedCartItem[] = c.items.map((it) => {
      const translations = it.product?.translations ?? [];
      const preferred =
        translations.find((t) => t.locale === locale) ??
        translations.find((t) => t.locale === Locale.EN) ??
        translations[0];
      const name = preferred?.name ?? "Product";
      const label = it.variant?.label ? ` — ${it.variant.label}` : "";
      return {
        productName: `${name}${label}`,
        quantity: it.quantity,
        imageUrl: it.product?.media?.[0]?.url ?? null,
      };
    });

    results.push({
      cartId: c.id,
      email: c.user.email,
      firstName: c.user.firstName,
      locale,
      itemCount: c._count.items,
      totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
      items,
    });
  }

  return results;
}

/**
 * Stamp the cart so it's not re-nudged. Idempotent via `updateMany`:
 * it touches nothing if the row already has a stamp.
 */
export async function markAbandonEmailSent(cartId: string): Promise<void> {
  await prisma.cart.updateMany({
    where: { id: cartId, lastAbandonEmailSentAt: null },
    data: { lastAbandonEmailSentAt: new Date() },
  });
}
