// ─────────────────────────────────────────────────────────────────────────
// Customer sign-in action — email + password.
//
// We never reveal whether an email exists or whether the password was the
// reason for failure — both present as a single generic error to avoid
// email-enumeration attacks.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/auth";

export type SignInState = {
  ok: boolean;
  message: string;
};

const InputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  locale: z.string().min(2).max(2),
  next: z.string().optional(),
});

export async function signInWithPasswordAction(
  _prev: SignInState | null,
  formData: FormData,
): Promise<SignInState> {
  const parsed = InputSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    locale: String(formData.get("locale") ?? "en"),
    next: String(formData.get("next") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: "Please check your details and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // Generic error — don't leak which field was wrong.
    return {
      ok: false,
      message: "We couldn't sign you in with those details.",
    };
  }

  // Make sure the Prisma profile exists and matches role.
  await ensureUserProfile(data.user);

  // Same-origin redirect only — never bounce to an external URL.
  const fallback = `/${parsed.data.locale}/account`;
  const target =
    parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//")
      ? parsed.data.next
      : fallback;

  redirect(target);
}
