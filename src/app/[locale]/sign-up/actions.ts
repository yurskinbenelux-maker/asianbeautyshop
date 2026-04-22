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
      emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`,
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
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
    await ensureUserProfile(data.user, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      preferredLocale: toPrismaLocale(parsed.data.locale),
      marketingOptIn: parsed.data.marketingOptIn,
    });
    redirect(next);
  }

  // Shouldn't reach here, but stay defensive.
  return { ok: false, message: "Unexpected sign-up result." };
}
