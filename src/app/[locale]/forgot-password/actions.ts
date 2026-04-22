// ─────────────────────────────────────────────────────────────────────────
// Forgot-password action — sends a reset link.
//
// We always report "link sent" regardless of whether the email exists, to
// avoid leaking which addresses have accounts.  Supabase handles the real
// branch internally — if there's no user, nothing goes out.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ForgotState = {
  ok: boolean;
  message: string;
  email?: string;
};

const InputSchema = z.object({
  email: z.string().email(),
  locale: z.string().min(2).max(2),
});

export async function sendResetLinkAction(
  _prev: ForgotState | null,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = InputSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    locale: String(formData.get("locale") ?? "en"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Please enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  // After the user clicks the reset link in their email, Supabase routes
  // them to /auth/callback?code=… which exchanges for a session, then
  // bounces to /[locale]/reset-password where they can set a new password.
  const next = `/${parsed.data.locale}/reset-password`;

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`,
  });

  // Don't reveal whether the email exists — always confirm.
  return {
    ok: true,
    email: parsed.data.email,
    message: `If an account exists for ${parsed.data.email}, a reset link is on its way.`,
  };
}
