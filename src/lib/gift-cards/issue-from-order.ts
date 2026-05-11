// ─────────────────────────────────────────────────────────────────────────
// issueGiftCardsForOrder — fires from the Mollie webhook on the PAID
// transition to mint real GiftCard rows from any GIFT_CARD line items on
// the order.
//
// Idempotent: skips lines that already have an `issuedGiftCardId`. Safe to
// re-call if the webhook fires twice or if an admin hand-syncs an order.
//
// What it does per gift-card line:
//   1. Read the `giftCardConfig` JSON snapshot persisted at order creation.
//   2. If `recipientEmail === "__buyer__"` (PDP sentinel for "for me"),
//      rewrite to the buyer's order email so the recipient row is
//      always deliverable.
//   3. Mint one GiftCard via lib/gift-cards/db.ts#issueGiftCard.
//   4. Stamp OrderItem.issuedGiftCardId so admin can chase it back.
//   5. Send the recipient email; for "send to friend" mode, also send a
//      confirmation receipt to the buyer.
//   6. Append an OrderEvent for the audit trail.
//
// Errors are swallowed per-line — one borked line shouldn't block the rest.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { ProductKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { issueGiftCard } from "./db";
import { isGiftCardConfig, type GiftCardConfig } from "./types";
import { sendGiftCardRecipientEmail } from "@/lib/email/gift-card-recipient";
import { sendGiftCardBuyerConfirmationEmail } from "@/lib/email/gift-card-buyer-confirmation";

export async function issueGiftCardsForOrder(orderId: string): Promise<{
  issued: number;
  skipped: number;
  failed: number;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      publicNumber: true,
      email: true,
      locale: true,
      userId: true,
      items: {
        select: {
          id: true,
          productId: true,
          variantId: true,
          quantity: true,
          unitPrice: true,
          nameSnapshot: true,
          giftCardConfig: true,
          issuedGiftCardId: true,
          product: { select: { kind: true } },
        },
      },
    },
  });
  if (!order) return { issued: 0, skipped: 0, failed: 0 };

  let issued = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of order.items) {
    if (item.product.kind !== ProductKind.GIFT_CARD) {
      continue;
    }
    if (item.issuedGiftCardId) {
      // Already minted on a previous pass — idempotency.
      skipped += 1;
      continue;
    }
    if (!isGiftCardConfig(item.giftCardConfig)) {
      // Defensive — should never happen for a gift-card line, but if the
      // payload is corrupt we'd rather skip and log than throw.
      console.warn(
        "[gift-cards] missing config on order item",
        item.id,
        order.publicNumber,
      );
      failed += 1;
      continue;
    }

    const config = item.giftCardConfig as GiftCardConfig;
    // "self" sentinel → use the buyer's checkout email.
    const recipientEmail =
      config.deliveryMode === "self" || config.recipientEmail === "__buyer__"
        ? order.email
        : config.recipientEmail;

    const amountEur = Number(item.unitPrice);

    try {
      const card = await issueGiftCard({
        amountEur,
        recipientEmail,
        recipientName: config.recipientName ?? null,
        senderName: config.senderName ?? null,
        message: config.message ?? null,
        purchaseOrderId: order.id,
      });

      // Persist back-references in one update so we don't half-mutate.
      // Also set deliveryMode + senderEmail + purchaseOrderItemId on the
      // GiftCard itself for cleaner admin queries — these aren't in the
      // db.ts helper because they're order-flow specific.
      await prisma.$transaction([
        prisma.giftCard.update({
          where: { id: card.id },
          data: {
            deliveryMode: config.deliveryMode,
            senderEmail: order.email,
            purchaseOrderItemId: item.id,
          },
        }),
        prisma.orderItem.update({
          where: { id: item.id },
          data: { issuedGiftCardId: card.id },
        }),
        prisma.orderEvent.create({
          data: {
            orderId: order.id,
            kind: "giftcard.issued",
            message: `Gift card ${card.code} issued (€${amountEur.toFixed(
              2,
            )})`,
            metadata: {
              giftCardId: card.id,
              code: card.code,
              recipientEmail,
              deliveryMode: config.deliveryMode,
            },
          },
        }),
      ]);

      // Emails — `allSettled` so a Resend outage on one doesn't block
      // the other or roll back the issuance above.
      await Promise.allSettled([
        sendGiftCardRecipientEmail({
          locale: order.locale,
          to: recipientEmail,
          recipientName: config.recipientName,
          senderName: config.senderName,
          buyerEmail: order.email,
          message: config.message,
          code: card.code,
          amountEur,
          deliveryMode: config.deliveryMode,
        }),
        // Only send a buyer-confirmation email when the card was sent to
        // a friend. For "self" mode, the recipient email IS the buyer's
        // — sending two would just be noise.
        config.deliveryMode === "friend"
          ? sendGiftCardBuyerConfirmationEmail({
              locale: order.locale,
              to: order.email,
              recipientName: config.recipientName,
              recipientEmail,
              code: card.code,
              amountEur,
            })
          : Promise.resolve(),
      ]);

      issued += 1;
    } catch (err) {
      console.error(
        "[gift-cards] failed to issue card for order item",
        item.id,
        err,
      );
      failed += 1;
    }
  }

  return { issued, skipped, failed };
}
