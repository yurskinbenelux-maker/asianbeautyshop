// ─────────────────────────────────────────────────────────────────────────
// Quiz skincare routine cart helper — adds the recommended product set to a cart
// with the per-line `quiz_reward` 15% discount markers.
//
// Called from two places:
//   1. The "Add my skincare routine to cart" button on /quiz/result (the user has
//      just completed the quiz and is logged in).
//   2. The /quiz/restore?token=… email-link route (the user is returning
//      after dismissing the quiz, possibly days later).
//
// Both scenarios end with the same cart state, so the logic lives here
// in a shared helper.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { Locale, ProductKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateCart } from "./cart";
import { getQuizRewardConfig } from "@/lib/quiz/reward";

/** Marker we write to CartItem.discountReason when the line was added
 *  via the quiz reward flow. The pricing engine looks for any non-null
 *  discountReason to decide whether to refuse coupon codes. */
export const QUIZ_REWARD_DISCOUNT_REASON = "quiz_reward";

/**
 * Replace the cart contents with the quiz-recommended skincare routine.
 *
 * We deliberately CLEAR the existing cart rather than merge — the email
 * link's promise is "we'll restore the EXACT cart you saw after the quiz".
 * Adding to an existing cart of unrelated items would muddy that contract,
 * and having mixed quiz / regular items in the same cart breaks the
 * coupon-stacking rules (any per-line discount blocks codes outright).
 *
 * @returns the number of lines actually added (filters unpublished /
 *          missing products silently — the quiz could have recommended a
 *          product that's since been archived).
 */
export async function loadQuizRitualIntoCart(args: {
  productIds: string[];
  locale: Locale;
}): Promise<{ added: number }> {
  // Drop duplicates while preserving the recommendation order.
  const uniqueIds = Array.from(new Set(args.productIds));
  if (uniqueIds.length === 0) return { added: 0 };

  // Resolve product prices + filter out anything that's been archived,
  // soft-deleted, or is a gift card (gift cards can't carry per-line
  // discounts in our pricing engine — they use a separate redemption flow).
  const products = await prisma.product.findMany({
    where: {
      id: { in: uniqueIds },
      deletedAt: null,
      status: "PUBLISHED",
      kind: ProductKind.STANDARD,
    },
    select: { id: true, price: true },
  });
  // Re-order to match the original recommendation order.
  const priceById = new Map(products.map((p) => [p.id, p.price]));

  const cart = await getOrCreateCart({ locale: args.locale });

  // Read live quiz discount % at the moment we materialise the cart
  // lines — the value is frozen onto each CartItem.discountPercent, so
  // a customer mid-checkout doesn't get a surprise rate change if an admin
  // edits /admin/marketing/promotions during their session.
  const { percentOff: quizPercent } = await getQuizRewardConfig();

  await prisma.$transaction(async (tx) => {
    // Wipe whatever was in the cart — the email link is a "restore the
    // exact skincare routine" affordance, not "merge into your existing basket".
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    // Add each recommended product as a quantity-1 line with the discount
    // markers. createMany is fastest but doesn't return rows; we don't
    // need them since the caller re-fetches the cart summary.
    const rows = uniqueIds
      .map((id) => {
        const price = priceById.get(id);
        if (!price) return null; // archived / unpublished — skip silently
        return {
          cartId: cart.id,
          productId: id,
          quantity: 1,
          unitPrice: price as Prisma.Decimal,
          discountReason: QUIZ_REWARD_DISCOUNT_REASON,
          discountPercent: quizPercent,
        };
      })
      .filter(<T,>(x: T | null): x is T => x !== null);

    if (rows.length > 0) {
      await tx.cartItem.createMany({ data: rows });
    }
  });

  return { added: products.length };
}
