"use server";

// ─────────────────────────────────────────────────────────────────────────
// Customer-facing task submission. Wraps submitTaskClaim with auth +
// redirect on success.
// ─────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireCustomer } from "@/lib/auth";
import { submitTaskClaim } from "@/lib/loyalty/tasks";

export type SubmitTaskState = {
  ok: boolean;
  message?: string;
};

const ERROR_COPY: Record<string, string> = {
  "task-not-found": "This task is no longer available.",
  "task-inactive": "This task is no longer available.",
  "task-not-claimable": "This task is awarded automatically — no submission needed.",
  "already-pending": "We're already reviewing your previous submission for this task.",
  "already-approved": "You've already claimed this one — only repeatable tasks can be claimed again.",
  "missing-proof": "Please paste the proof URL.",
  "program-paused": "The loyalty programme is currently paused.",
};

export async function submitTaskClaimAction(
  _prev: SubmitTaskState | null,
  formData: FormData,
): Promise<SubmitTaskState> {
  const locale = String(formData.get("locale") ?? "en");
  const slug = String(formData.get("slug") ?? "");

  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/club/earn/${slug}`,
  });

  const result = await submitTaskClaim({
    userId: profile.id,
    slug,
    proofUrl: formData.get("proofUrl")?.toString(),
    notes: formData.get("notes")?.toString(),
  });

  if (!result.ok) {
    return { ok: false, message: ERROR_COPY[result.reason] ?? "Something went wrong." };
  }

  revalidatePath(`/${locale}/account/club/earn`);
  revalidatePath(`/${locale}/account/club/earn/${slug}`);
  redirect(`/${locale}/account/club/earn?submitted=${encodeURIComponent(slug)}`);
}
