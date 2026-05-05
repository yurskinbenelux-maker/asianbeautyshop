"use server";

// ─────────────────────────────────────────────────────────────────────────
// Customer-facing redeem action. Thin wrapper around redeemReward in
// the loyalty lib — handles auth + redirect on success.
// ─────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireCustomer } from "@/lib/auth";
import { redeemReward } from "@/lib/loyalty/redeem";

export type RedeemActionState = {
  ok: boolean;
  message?: string;
  /** When ok=true, the freshly minted code so the success page can show it. */
  couponCode?: string;
};

export async function redeemRewardAction(
  _prev: RedeemActionState | null,
  formData: FormData,
): Promise<RedeemActionState> {
  const locale = String(formData.get("locale") ?? "en");
  const rewardId = String(formData.get("rewardId") ?? "");

  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/club/redeem/${rewardId}`,
  });

  const result = await redeemReward({
    userId: profile.id,
    rewardId,
    firstName: profile.firstName,
  });

  if (!result.ok) {
    const map: Record<string, string> = {
      "reward-not-found": "This reward is no longer available.",
      "reward-inactive": "This reward is no longer available.",
      "insufficient-points": "You don't have enough points yet.",
      "program-paused": "The loyalty programme is currently paused.",
      "product-missing": "The linked product is unavailable.",
      "code-collision": "Couldn't generate a unique code — please try again.",
      unknown: "Something went wrong. Please try again.",
    };
    return { ok: false, message: map[result.reason] ?? map.unknown };
  }

  // Revalidate the surfaces that show points + coupons.
  revalidatePath(`/${locale}/account`);
  revalidatePath(`/${locale}/account/club/coupons`);
  revalidatePath(`/${locale}/account/club/redeem`);

  redirect(
    `/${locale}/account/club/coupons?redeemed=${encodeURIComponent(
      result.couponCode,
    )}`,
  );
}
