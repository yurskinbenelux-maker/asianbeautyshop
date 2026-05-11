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

  // After the user clicks the reset link in their email, the branded
  // template (in Supabase) routes them to our /auth/confirm route with
  // type=recovery + the token_hash. /auth/confirm calls verifyOtp,
  // which mints the recovery session, then redirects to `next` —
  // /[locale]/reset-password where the customer sets a new password.
  //
  // We pass the locale-aware path as `redirectTo` (NOT a /auth/callback
  // URL) so Supabase surfaces it as `{{ .RedirectTo }}` in the email
  // template. Supabase still validates this against its redirect
  // allow-list — asianbeautyshop.eu/** must be permitted there (Supabase Auth → URL Configuration → Redirect URLs).
  const next = `/${parsed.data.locale}/reset-password`;

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${site}${next}`,
  });

  // Don't reveal whether the email exists — always confirm.
  return {
    ok: true,
    email: parsed.data.email,
    message: `If an account exists for ${parsed.data.email}, a reset link is on its way.`,
  };
}
