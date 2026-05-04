// ─────────────────────────────────────────────────────────────────────────
// GET /auth/confirm?token_hash=…&type=signup&next=/ru/account
//
// Token-hash verification — replaces the older PKCE-based /auth/callback
// for email-based flows (signup confirm, magic link, password recovery,
// email change).
//
// Why we built this:
//   1. The PKCE flow at /auth/callback puts a `*.supabase.co/auth/v1/verify`
//      URL into the email. Customers see that as the fallback link and
//      it looks like a phishing redirect.
//   2. PKCE requires the code_verifier cookie set during signup to be
//      present when the email link is clicked. Click the email on a
//      different browser / cleared cookies / different device → the
//      verifier is gone → exchange fails → "missing_code" + "OTP
//      expired" landing on /sign-in.
//   3. PKCE's single-use exchange code can also be consumed prematurely
//      by email scanners (Gmail link preview, corporate spam filters,
//      Resend click-tracking proxies). When the human finally clicks,
//      the code is already burned → "OTP expired" on what felt like
//      the first click.
//
// Token-hash flow fixes all three:
//   · The email link points to https://yurskinsolution.eu/auth/confirm?…
//     — no more *.supabase.co URL visible to the customer.
//   · verifyOtp({ token_hash, type }) doesn't need a code_verifier — works
//     across browsers/devices.
//   · The single-use property still applies, but the URL hits OUR origin
//     first. Bots that pre-fetch will burn the token, so we strongly
//     recommend disabling click-tracking in Resend for transactional
//     emails (one toggle, see Resend → Domains → Click tracking).
//
// Supabase template that pairs with this route:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { issueRegistrationWelcomeCoupon } from "@/lib/coupons/registration-welcome";

// Whitelist of OTP types we accept. Mirrors Supabase's EmailOtpType union
// — keeps a hostile querystring from passing a bogus type to verifyOtp.
const VALID_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isValidType(t: string | null): t is EmailOtpType {
  return t !== null && (VALID_TYPES as string[]).includes(t);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/account";

  // Absolute origin from env, NOT request.nextUrl.origin — Hostinger's
  // proxy makes the Node process see 0.0.0.0:3000 which would leak.
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  // Defensive against open-redirect: the `next` URL has to live on our
  // own domain. Anything else (including protocol-relative `//evil.com`)
  // collapses to the safe default.
  function safeNext(): string {
    try {
      // Absolute URLs only allowed on our origin.
      if (/^https?:\/\//i.test(next)) {
        const u = new URL(next);
        if (u.origin === site) return u.pathname + u.search + u.hash;
        return "/account";
      }
    } catch {
      return "/account";
    }
    if (next.startsWith("/") && !next.startsWith("//")) return next;
    return "/account";
  }

  if (!token_hash || !isValidType(type)) {
    return NextResponse.redirect(`${site}/sign-in?error=missing_token`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash,
  });

  if (error) {
    // Common errors: "Email link is invalid or has expired" (token used
    // or older than the configured TTL). Surface a friendly hint via
    // /sign-in's error query so the form can show "request a new link"
    // copy if we ever build that affordance.
    return NextResponse.redirect(
      `${site}/sign-in?error=${encodeURIComponent(error.message)}`,
    );
  }

  // First-time signup confirmation → mint the welcome 10% coupon and
  // email it. Idempotent (deterministic code per user.id), so a repeat
  // click on the same confirm link is a no-op. Other OTP types
  // (recovery, email_change, magiclink) deliberately don't issue —
  // those aren't account-creation events.
  //
  // We deliberately don't await this: the redirect must always complete
  // even if Resend or DB hiccups. Errors are logged inside the helper.
  if (type === "signup" && data?.user?.id && data.user.email) {
    void issueRegistrationWelcomeCoupon({
      userId: data.user.id,
      email: data.user.email,
    });
  }

  return NextResponse.redirect(`${site}${safeNext()}`);
}
