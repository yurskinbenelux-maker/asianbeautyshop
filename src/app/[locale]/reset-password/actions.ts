// ─────────────────────────────────────────────────────────────────────────
// Reset-password action — update the signed-in user's password.
//
// User gets here after clicking the reset link, which ran them through
// /auth/callback and now they have a fresh session.  We just call
// updateUser({ password }) — no verification token handling needed on our
// side, Supabase already did that.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResetState = {
  ok: boolean;
  message: string;
};

const InputSchema = z.object({
  password: z.string().min(8),
  locale: z.string().min(2).max(2),
});

export async function resetPasswordAction(
  _prev: ResetState | null,
  formData: FormData,
): Promise<ResetState> {
  const parsed = InputSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    locale: String(formData.get("locale") ?? "en"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      message:
        "Your reset link has expired or was already used. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { ok: false, message: error.message };
  }

  redirect(`/${parsed.data.locale}/account`);
}
