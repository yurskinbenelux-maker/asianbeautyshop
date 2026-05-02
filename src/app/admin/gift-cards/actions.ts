// ─────────────────────────────────────────────────────────────────────────
// Admin actions for /admin/gift-cards/[id].
//
// Both actions are guarded by the `giftcards.manage` capability — only
// owner-level admins can void or resend. They append AuditLog entries so
// Sofia can trace any mutation.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { GiftCardStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";
import { sendGiftCardRecipientEmail } from "@/lib/email/gift-card-recipient";

export async function voidGiftCardAction(formData: FormData): Promise<void> {
  const { user } = await requireCapability(
    "giftcards.manage",
    "/admin/gift-cards",
  );

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const card = await prisma.giftCard.findUnique({
    where: { id },
    select: { id: true, code: true, balance: true, status: true },
  });
  if (!card || card.status === GiftCardStatus.VOID) {
    revalidatePath(`/admin/gift-cards/${id}`);
    return;
  }

  await prisma.$transaction([
    prisma.giftCard.update({
      where: { id },
      data: {
        status: GiftCardStatus.VOID,
        balance: new Prisma.Decimal(0),
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorEmail: user.email ?? null,
        action: "giftcard.void",
        entityType: "GiftCard",
        entityId: id,
        summary: `Voided gift card ${card.code}`,
        meta: { previousBalance: Number(card.balance) },
      },
    }),
  ]);

  revalidatePath("/admin/gift-cards");
  revalidatePath(`/admin/gift-cards/${id}`);
}

/**
 * Resend the recipient email for a gift card. Useful when:
 *   · the friend says they never received it (spam folder, typo)
 *   · the buyer asks Sofia to nudge their friend
 *
 * Reuses the same template that fires from the Mollie paid webhook.
 */
export async function resendGiftCardAction(
  formData: FormData,
): Promise<void> {
  const { user } = await requireCapability(
    "giftcards.manage",
    "/admin/gift-cards",
  );

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const card = await prisma.giftCard.findUnique({
    where: { id },
    include: {
      // We need the order locale to localise the email properly.
      // Fall back to EN if the card was admin-issued (no purchase order).
    },
  });
  if (!card) return;

  // Resolve the order locale, otherwise default to EN.
  let locale: "EN" | "NL" | "FR" | "RU" = "EN";
  if (card.purchaseOrderId) {
    const order = await prisma.order.findUnique({
      where: { id: card.purchaseOrderId },
      select: { locale: true },
    });
    if (order?.locale) locale = order.locale;
  }

  await sendGiftCardRecipientEmail({
    locale,
    to: card.recipientEmail,
    recipientName: card.recipientName,
    senderName: card.senderName,
    buyerEmail: card.senderEmail ?? "",
    message: card.message,
    code: card.code,
    amountEur: Number(card.balance),
    deliveryMode:
      card.deliveryMode === "friend" ? "friend" : "self",
    expiresAt: card.expiresAt ?? undefined,
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorEmail: user.email,
      action: "giftcard.resend",
      entityType: "GiftCard",
      entityId: id,
      summary: `Resent gift card ${card.code} to ${card.recipientEmail}`,
    },
  });

  revalidatePath(`/admin/gift-cards/${id}`);
}
