// ─────────────────────────────────────────────────────────────────────────
// Gift card types shared between client and server.
//
// Lives outside lib/gift-cards/db.ts (which is "server-only") so the PDP
// configurator and cart drawer can import the type without dragging Prisma
// into the client bundle.
// ─────────────────────────────────────────────────────────────────────────

/** Was the buyer treating themselves, or sending the card to a friend? */
export type GiftCardDeliveryMode = "self" | "friend";

/**
 * Per-line gift-card configuration captured on the PDP and persisted to
 * CartItem.giftCardConfig + OrderItem.giftCardConfig as a JSON column.
 *
 * `recipientEmail` is required even for the "self" mode — we copy the
 * buyer's email into it at submit time so the post-payment hook always
 * has a deliverable address.
 */
export type GiftCardConfig = {
  deliveryMode: GiftCardDeliveryMode;
  recipientEmail: string;
  recipientName?: string | null;
  senderName?: string | null;
  message?: string | null;
};

/** Type guard — accepts any JSON blob and validates the gift-card shape. */
export function isGiftCardConfig(v: unknown): v is GiftCardConfig {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.deliveryMode === "self" || o.deliveryMode === "friend") &&
    typeof o.recipientEmail === "string" &&
    o.recipientEmail.length > 0
  );
}

/**
 * Available denominations the customer can buy. Mirrors the seed script
 * (DENOMINATIONS) so the PDP and seed never drift. Update both at once.
 */
export const GIFT_CARD_DENOMINATIONS_EUR = [25, 50, 100, 200, 500] as const;
export type GiftCardDenominationEur =
  (typeof GIFT_CARD_DENOMINATIONS_EUR)[number];
