// ─────────────────────────────────────────────────────────────────────────
// Customer-side return actions.
//
// Only one action for now: cancelReturnAction. The DB helper is guarded to
// allow cancellation only while the return is still REQUESTED.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCustomer } from "@/lib/auth";
import { cancelReturnAsCustomer } from "@/lib/returns/db";

export async function cancelReturnAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "en");
  const publicNumber = String(formData.get("publicNumber") ?? "");
  if (!publicNumber) return;

  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/returns/${publicNumber}`,
  });

  try {
    await cancelReturnAsCustomer(profile.id, publicNumber);
  } catch (err) {
    console.error("[returns] cancelReturnAction failed", err);
  }

  revalidatePath(`/${locale}/account/returns`);
  revalidatePath(`/${locale}/account/returns/${publicNumber}`);
  redirect(`/${locale}/account/returns/${encodeURIComponent(publicNumber)}`);
}
