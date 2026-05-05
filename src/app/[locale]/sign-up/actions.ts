// ─────────────────────────────────────────────────────────────────────────
// Customer sign-up action — email + password + name.
//
// Supabase sends a confirmation email if email-confirmation is enabled in
// the project settings.  If it's disabled (dev), we get a session back
// immediately and redirect to /account.  Either way, we mirror the user
// into Prisma as a CUSTOMER so the account pages have a profile to show.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserProfile, toPrismaLocale } from "@/lib/auth";

export type SignUpState = {
  ok: boolean;
  message: string;
  awaitConfirm?: boolean; // show the "check inbox" panel
  email?: string;
};

const InputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  marketingOptIn: z.boolean(),
  acceptsTerms: z.literal(true),
  locale: z.string().min(2).max(2),
  // Optional referral code — passed through to Supabase user_metadata so
  // /auth/confirm can pick it up after the customer verifies their email.
  // We don't validate against the DB here; the confirm route re-resolves
  // it (and silently ignores unknown / self-referral codes).
  referralCode: z
    .string()
    .max(32)
    .regex(/^[A-Z0-9-]*$/i, "Referral code: letters, numbers, dashes only.")
    .optional(),
});

export async function signUpAction(
  _prev: SignUpState | null,
  formData: FormData,
): Promise<SignUpState> {
  const parsed = InputSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    marketingOptIn: formData.get("marketingOptIn") === "on",
    acceptsTerms: formData.get("acceptsTerms") === "on",
    locale: String(formData.get("locale") ?? "en"),
    referralCode: String(formData.get("referralCode") ?? "")
      .trim()
      .toUpperCase() || undefined,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const map: Record<string, string> = {
      email: "Please enter a valid email address.",
      password: "Password must be at least 8 characters.",
      firstName: "Please tell us your first name.",
      lastName: "Please tell us your last name.",
      acceptsTerms: "Please accept the terms to continue.",
    };
    const key = issue.path[0]?.toString() ?? "";
    return {
      ok: false,
      message: map[key] ?? "Please check the highlighted fields.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  const next = `/${parsed.data.locale}/account`;

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Pass the locale-aware account URL as `emailRedirectTo`. Supabase
      // surfaces this back to the email template as `{{ .RedirectTo }}`,
      // which we plug into the token-hash confirm URL — see
      // src/app/auth/confirm/route.ts and the Supabase email template
      // for the full flow. The customer's email button will land them
      // straight on /ru/account (or whichever locale) already signed in.
      emailRedirectTo: `${site}${next}`,
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        // Locale picked at signup — surfaced to Supabase email
        // templates as `{{ .Data.locale }}`. The "Confirm signup"
        // template uses a Go conditional to render the right
        // language. ensureUserProfile mirrors this to
        // user.preferredLocale so every Resend-sent email post-signup
        // (order confirmation, shipped, abandoned cart, etc.) picks
        // up the same value automatically.
        locale: parsed.data.locale,
        // Referral code stored on user_metadata so /auth/confirm can
        // resolve it AFTER the email is verified — at which point the
        // referee's account exists in Prisma and we can create the
        // Referral row + mint the FRIEND coupon.
        ...(parsed.data.referralCode && {
          referral_code: parsed.data.referralCode,
        }),
      },
    },
  });

  if (error) {
    // Supabase returns a clear "User already registered" error — pass
    // that through so a returning customer can course-correct to sign-in.
    return {
      ok: false,
      message: error.message || "We couldn't create your account.",
    };
  }

  // Email-confirmation ON — no session yet.
  if (!data.session && data.user) {
    return {
      ok: true,
      awaitConfirm: true,
      email: parsed.data.email,
      message: `We sent a confirmation link to ${parsed.data.email}.`,
    };
  }

  // Email-confirmation OFF — we're in.  Mirror to Prisma and continue.
  if (data.session && data.user) {
    const profile = await ensureUserProfile(data.user, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      preferredLocale: toPrismaLocale(parsed.data.locale),
      marketingOptIn: parsed.data.marketingOptIn,
    });
    // Referral linkage on the no-confirmation path. The flow used in
    // production has email-confirmation ON so /auth/confirm handles this;
    // this branch covers dev + the (unlikely) case where Sofia disables
    // confirmation in Supabase later.
    if (parsed.data.referralCode) {
      try {
        const { linkReferralAtSignup } = await import(
          "@/lib/loyalty/referral"
        );
        await linkReferralAtSignup({
          refereeUserId: profile.id,
          refereeEmail: profile.email,
          code: parsed.data.referralCode,
        });
      } catch (err) {
        console.error("[sign-up] linkReferralAtSignup failed", err);
      }
    }
    redirect(next);
  }

  // Shouldn't reach here, but stay defensive.
  return { ok: false, message: "Unexpected sign-up result." };
}
