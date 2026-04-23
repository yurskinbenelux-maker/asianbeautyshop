// ─────────────────────────────────────────────────────────────────────────
// Privacy page server actions — schedule / cancel account deletion.
//
// The actual data export is served by /api/account/export as a file
// download, so there's no "export my data" server action here.
//
// Flow:
//   requestAccountDeletion   — sets User.deletedAt = now, then signs the
//                              user out.  A nightly cron purges users whose
//                              deletedAt has exceeded ERASURE_GRACE_DAYS.
//   cancelAccountDeletion    — clears User.deletedAt.  Only available while
//                              the user is still signed in (they can sign
//                              back in before the grace period expires to
//                              undo the request).
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCustomer } from "@/lib/auth";
import {
  scheduleAccountDeletion,
  cancelAccountDeletion,
} from "@/lib/queries/gdpr";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requestAccountDeletion(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "en");
  const confirm = String(formData.get("confirm") ?? "");

  // Require the user to type the literal word "DELETE" to proceed — small
  // friction that prevents accidental taps on mobile.
  if (confirm !== "DELETE") {
    redirect(`/${locale}/account/privacy?error=confirm`);
  }

  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/privacy",
  });

  try {
    await scheduleAccountDeletion(profile.id);
  } catch (err) {
    console.error("[gdpr] scheduleAccountDeletion failed", err);
    redirect(`/${locale}/account/privacy?error=server`);
  }

  // Sign the user out so they stop seeing their (now-pending-delete) data.
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("[gdpr] sign-out after deletion-request failed", err);
  }

  revalidatePath(`/${locale}/account/privacy`);
  redirect(`/${locale}/?deleted=scheduled`);
}

export async function cancelAccountDeletionAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "en");

  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/privacy",
  });

  try {
    await cancelAccountDeletion(profile.id);
  } catch (err) {
    console.error("[gdpr] cancelAccountDeletion failed", err);
  }

  revalidatePath(`/${locale}/account/privacy`);
  redirect(`/${locale}/account/privacy?cancelled=1`);
}
