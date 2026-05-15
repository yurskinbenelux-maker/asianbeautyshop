// ─────────────────────────────────────────────────────────────────────────
// GoogleSignInButton — "Continue with Google" CTA used on /sign-in and
// /sign-up.
//
// Why a single button for both pages: from Supabase's perspective Google
// OAuth is the same flow regardless of whether the user is signing in
// for the first time or returning. We just call signInWithOAuth(); the
// callback at /auth/callback handles "create User row if new, hydrate
// session if returning" via ensureUserProfile() — idempotent upsert.
//
// Where it sits in the auth pipeline:
//
//   [click button]
//     └─→ supabase.auth.signInWithOAuth({ provider: "google", ... })
//          └─→ browser navigates to https://accounts.google.com
//               └─→ user consents
//                    └─→ Google → https://<project>.supabase.co/auth/v1/callback?code
//                         └─→ Supabase → https://asianbeautyshop.eu/auth/callback?code&next
//                              └─→ our route exchanges code for session
//                                   └─→ ensureUserProfile() upserts Prisma row
//                                        └─→ issueRegistrationWelcomeCoupon() (first-time only — idempotent)
//                                             └─→ redirect to `next`
//
// Locale awareness:
//   The `next` query param defaults to `/{locale}/account` so first-time
//   Google sign-ups still land in their preferred language. The redirectTo
//   URL points at the locale-less `/auth/callback` route because Supabase
//   needs an exact-match registered redirect URI in Google Cloud Console
//   — keeping it locale-agnostic means one redirect URI works for all
//   four locales.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  /** Current URL locale — used to build the post-signin destination. */
  locale: string;
  /** Optional override for where to land after sign-in (e.g. the `next`
   *  param on /sign-in). Falls back to `/{locale}/account`. Validated
   *  server-side by /auth/callback as a same-origin path. */
  next?: string;
};

export function GoogleSignInButton({ locale, next }: Props) {
  const t = useTranslations("auth");
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);

    // Resolve the post-auth landing page. We prefer the caller-supplied
    // `next`, fall back to the customer account in the current locale.
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : `/${locale}/account`;

    // Build the callback URL. Must:
    //   · point at our own origin (Supabase strict-matches this against
    //     the redirectTo allow-list configured in Supabase dashboard)
    //   · be locale-LESS — so the redirect URI registered in Google Cloud
    //     Console is a single static URL good for all four locales
    //   · carry the `next` we want to land on after the exchange
    //
    // Using window.location.origin instead of NEXT_PUBLIC_SITE_URL on
    // purpose: in local dev that lets the flow work against
    // http://localhost:3000 without env tweaks.
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        // Send the user's preferred UI locale to Google so the consent
        // screen renders in their language (EN/NL/FR/RU). Falls back to
        // English if Google doesn't have the translation.
        queryParams: { hl: locale },
      },
    });

    // If signInWithOAuth returns synchronously without a redirect (rare,
    // only on policy-block or pop-up blocker scenarios) clear the loading
    // state so the user can try again.
    if (error) {
      console.error("[google-sign-in] error", error);
      setLoading(false);
    }
    // On success the browser is already navigating away — no setState
    // needed; the page unloads.
  }

  return (
    <div className="space-y-4">
      {/* "or" divider — visually separates email/password from OAuth so
          customers don't get confused about which set of fields to use. */}
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-label text-ink-mid">
        <span className="h-px flex-1 bg-ink/10" aria-hidden />
        <span>{t("oauth_divider_or")}</span>
        <span className="h-px flex-1 bg-ink/10" aria-hidden />
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-3 border border-ink/15 bg-white text-[13px] text-ink transition-colors hover:bg-ink/5 disabled:cursor-wait disabled:opacity-60"
      >
        {/* Inline Google "G" mark — uses the official four-colour glyph.
            Inline SVG keeps it crisp at any size and means zero extra
            network requests. */}
        <GoogleGlyph className="h-[18px] w-[18px]" />
        <span>{loading ? t("oauth_google_loading") : t("oauth_google_cta")}</span>
      </button>
    </div>
  );
}

/** Google's "G" logo — taken from the public brand assets and embedded
 *  as four colour-path SVG so it's pixel-perfect without an external
 *  request. The dimensions are the canonical 48×48 viewBox Google
 *  ships with their sign-in branding kit. */
function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
