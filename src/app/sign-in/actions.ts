// ─────────────────────────────────────────────────────────────────────────
// Sign-in server actions — send a magic link.
//
// We use Supabase's email-OTP (magic link) flow: user types their email,
// gets a clickable link by mail, lands at /auth/callback which exchanges
// the one-time code for a session cookie.
//
// No passwords anywhere.  Zero-friction for an admin, no password-reset
// drama, and fewer things to get hacked.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = {
  ok: boolean;
  message: string;
};

export async function sendMagicLink(
  _prev: SignInState | null,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/admin");

  if (!email || !email.includes("@")) {
    return { ok: false, message: "Please enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();

  // Build an absolute URL pointing at the post-verification destination.
  // We deliberately do NOT include /auth/callback in this string — the
  // branded magic-link email template uses our token-hash flow (route
  // /auth/confirm) and consumes {{ .RedirectTo }} as a plain `next`
  // target. Supabase still uses this value for its own redirect-allow-
  // list check, so the safe `https://asianbeautyshop.eu/...` shape
  // matters.
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  const emailRedirectTo = `${site}${next}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      // shouldCreateUser=true lets first-time admins sign in without any
      // pre-seeding — the allow-list check still gates /admin.
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: `Check your inbox — we just sent a sign-in link to ${email}.`,
  };
}
