// ─────────────────────────────────────────────────────────────────────────
// GET /auth/callback?code=…&next=/account
//
// PKCE/OAuth code-exchange endpoint. Handles two flows:
//
//   1. Admin magic links — Supabase emails the admin a one-time link
//      that hits here. (Pre-dates Google sign-in by months.)
//
//   2. "Continue with Google" customer sign-in — the GoogleSignInButton
//      kicks off an OAuth round-trip ending here. After exchangeCodeForSession
//      we hydrate the Prisma `User` row via ensureUserProfile() so the
//      rest of the app (A-Beauty Club, orders, addresses, wishlist) can
//      find a customer row regardless of whether they signed up with
//      email or Google.
//
//   3. For first-time Google sign-ups, we also fire the same 10%-off
//      welcome coupon the email-confirm flow issues — gated on the SAME
//      idempotent helper so a returning Google user doesn't re-receive
//      the coupon on every sign-in.
//
// Both flows ultimately need the same primitives: exchange the code,
// upsert the profile, optionally issue the welcome coupon. The default
// `next` falls back to `/admin` for backwards-compat with the old
// magic-link flow — customer-facing callers (the Google button) always
// pass an explicit `next` so this fallback never bites them.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/auth";
import { issueRegistrationWelcomeCoupon } from "@/lib/coupons/registration-welcome";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin";

  // Absolute origin comes from env, NOT request.nextUrl.origin.
  // Behind Hostinger's reverse proxy the Node process sees 0.0.0.0:3000,
  // which would leak into client-facing redirects.
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(`${site}/sign-in?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${site}/sign-in?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Hydrate Prisma profile so downstream features (loyalty, orders,
  // wishlist, etc.) have a row to join against. Idempotent upsert —
  // safe to call on every callback hit. We do this for BOTH magic-link
  // admins and Google customers; the helper handles either provider
  // identically because it reads from auth.users.user_metadata which
  // Supabase populates from the OAuth claims automatically.
  if (data?.user) {
    try {
      await ensureUserProfile(data.user);
    } catch (err) {
      // Don't block the redirect on a Prisma hiccup — the admin/customer
      // can still operate on Supabase auth alone for the rest of the
      // session. Log so we can see if this fires in prod.
      console.error("[auth/callback] ensureUserProfile failed", err);
    }

    // First-time Google sign-up → mint the welcome 10% coupon + email
    // it. The helper checks for an existing row first (deterministic
    // code per user.id), so the second-and-later Google sign-ins by the
    // same user are no-ops. We deliberately don't await so the redirect
    // always completes even if Resend has a momentary outage.
    //
    // Email is conditional because OAuth users CAN come back with no
    // email if their Google account has no verified primary address —
    // very rare, but the coupon helper requires one to send the email.
    //
    // Admins also pass through this path on magic-link sign-in; their
    // `id` collision against an existing User row means the helper
    // short-circuits — admins don't get welcome coupons.
    if (data.user.email && data.user.id) {
      void issueRegistrationWelcomeCoupon({
        userId: data.user.id,
        email: data.user.email,
      });
    }
  }

  // Prevent open-redirect: only allow relative paths back into our site.
  const safeNext = next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/admin";

  return NextResponse.redirect(`${site}${safeNext}`);
}
