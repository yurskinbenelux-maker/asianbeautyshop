// ─────────────────────────────────────────────────────────────────────────
// Checkout-side gift-card actions.
//
// Used by the client-side <GiftCardCodesField /> to validate codes as the
// customer pastes them — returns the card's available balance + status so
// the chip UI can show "GIFT-XXXX · €50" without exposing the underlying
// id (which we do still hand back so the submit step can look up the card
// without re-validating, but it's harmless: the id alone can't redeem).
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { lookupGiftCard, GIFT_CODE_PREFIX } from "@/lib/gift-cards/db";

export type GiftCardLookupResult =
  | {
      ok: true;
      code: string;
      giftCardId: string;
      balanceEur: number;
    }
  | {
      ok: false;
      reason: "invalid" | "void" | "expired" | "depleted" | "not-found";
    };

export async function lookupGiftCardAction(
  rawCode: string,
): Promise<GiftCardLookupResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code.startsWith(GIFT_CODE_PREFIX)) {
    return { ok: false, reason: "invalid" };
  }

  const result = await lookupGiftCard(code);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  return {
    ok: true,
    code,
    giftCardId: result.id,
    balanceEur: result.balance,
  };
}
