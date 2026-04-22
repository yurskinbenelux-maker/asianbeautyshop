// ─────────────────────────────────────────────────────────────────────────
// Server actions for /[locale]/account/profile
//
//   updateProfileAction  — name, phone, preferred locale, marketing opt-in
//   updatePasswordAction — change password (needs current session)
//
// Both scoped to the caller via requireCustomer().  Password update uses
// Supabase Auth directly — we never store passwords in our DB.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCustomer, toPrismaLocale } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

export const INITIAL_PROFILE_STATE: ActionState = { ok: false, message: "" };

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

// ─────────────────────── profile (name / phone / locale) ──────────────────
const ProfileSchema = z.object({
  firstName: z.preprocess(
    emptyToNull,
    z.string().trim().max(60).nullable(),
  ),
  lastName: z.preprocess(
    emptyToNull,
    z.string().trim().max(60).nullable(),
  ),
  phone: z.preprocess(emptyToNull, z.string().trim().max(40).nullable()),
  preferredLocale: z.enum(["en", "nl", "fr", "ru"]),
  marketingOptIn: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
  locale: z.string().min(2).max(2),
});

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0];
      if (typeof k === "string" && !(k in fieldErrors)) {
        fieldErrors[k] = i.message;
      }
    }
    return { ok: false, message: "invalid", fieldErrors };
  }

  const { locale, preferredLocale, marketingOptIn, ...data } = parsed.data;
  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/profile",
  });

  const newPreferred = toPrismaLocale(preferredLocale);
  const optInChanged = profile.marketingOptIn !== marketingOptIn;

  await prisma.user.update({
    where: { id: profile.id },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      preferredLocale: newPreferred,
      marketingOptIn,
      ...(optInChanged && {
        marketingOptInAt: marketingOptIn ? new Date() : null,
      }),
    },
  });

  revalidatePath(`/${locale}/account`);
  revalidatePath(`/${locale}/account/profile`);

  return { ok: true, message: "saved" };
}

// ─────────────────────────────── password ────────────────────────────────
const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "required"),
    newPassword: z.string().min(8, "too_short"),
    confirmPassword: z.string().min(1, "required"),
    locale: z.string().min(2).max(2),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "mismatch",
    path: ["confirmPassword"],
  });

export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = PasswordSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0];
      if (typeof k === "string" && !(k in fieldErrors)) {
        fieldErrors[k] = i.message;
      }
    }
    return { ok: false, message: "invalid", fieldErrors };
  }

  const { locale, currentPassword, newPassword } = parsed.data;
  const { supabase: user } = await requireCustomer({
    locale,
    redirectTo: "/account/profile",
  });

  const supabase = await createSupabaseServerClient();

  // Re-authenticate by signing in with the current password. Supabase has no
  // direct "verify password" API, so we use signInWithPassword which is a
  // no-op for the already-signed-in session when successful.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email ?? "",
    password: currentPassword,
  });
  if (signInError) {
    return {
      ok: false,
      message: "current_wrong",
      fieldErrors: { currentPassword: "wrong" },
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    return { ok: false, message: "update_failed" };
  }

  revalidatePath(`/${locale}/account/profile`);
  return { ok: true, message: "password_saved" };
}

// Re-export Locale for form consumers that render radio options.
export { Locale };
