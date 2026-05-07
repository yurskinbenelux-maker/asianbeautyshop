// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/customers.
//
// Surfaces we need:
//   • updateProfileAction     — edit name, phone, locale, marketing flag
//   • updateRoleAction        — promote/demote (CUSTOMER ↔ STAFF ↔ ADMIN)
//   • sendPasswordResetAction — trigger Supabase reset email
//   • softDeleteAction        — flag User.deletedAt, anonymise identifiers
//   • restoreAction           — undo a soft delete if within reason
//
// We intentionally do NOT hard-delete the User row: orders, reviews, and
// wishlist history stay relatable for bookkeeping. Instead we clear the
// personally-identifying fields on soft-delete, satisfying GDPR erasure
// while keeping the audit trail useful.
//
// an admin can't accidentally demote herself from ADMIN because we refuse
// any role-change that targets the currently-signed-in admin. Prevents
// the "last admin locks themselves out" footgun.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Locale, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// ──────── shared types ────────────────────────────────────────────────

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

// ──────── helpers ────────────────────────────────────────────────────

function revalidateCustomer(id: string) {
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
}

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

// ──────── update basic profile ────────────────────────────────────────

const ProfileSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.preprocess(emptyToNull, z.string().min(1).max(80).nullable()),
  lastName: z.preprocess(emptyToNull, z.string().min(1).max(80).nullable()),
  phone: z.preprocess(emptyToNull, z.string().min(3).max(40).nullable()),
  preferredLocale: z.nativeEnum(Locale),
  marketingOptIn: z.coerce.boolean(),
});

export async function updateCustomerProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = ProfileSchema.safeParse({
    userId: formData.get("userId"),
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    phone: formData.get("phone") ?? "",
    preferredLocale: formData.get("preferredLocale"),
    marketingOptIn: formData.get("marketingOptIn") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { userId, firstName, lastName, phone, preferredLocale, marketingOptIn } =
    parsed.data;

  // If admin just ticked marketing opt-in, stamp the timestamp so we can
  // later prove consent. Don't clear marketingOptInAt on opt-out — the
  // original consent still happened.
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { marketingOptIn: true, marketingOptInAt: true },
  });
  if (!existing) return { ok: false, message: "Customer not found." };

  const nextOptInAt =
    marketingOptIn && !existing.marketingOptIn
      ? new Date()
      : existing.marketingOptInAt;

  await prisma.user.update({
    where: { id: userId },
    data: {
      firstName,
      lastName,
      phone,
      preferredLocale,
      marketingOptIn,
      marketingOptInAt: nextOptInAt,
    },
  });

  revalidateCustomer(userId);
  return OK_SAVED;
}

// ──────── change role ────────────────────────────────────────────────

const RoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(Role),
});

export async function updateCustomerRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = RoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid role." };

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true, role: true },
  });
  if (!target) return { ok: false, message: "Customer not found." };

  // Safety: an admin can't demote themselves; they'd lock out of /admin.
  if (actor.email && target.email.toLowerCase() === actor.email.toLowerCase()) {
    return {
      ok: false,
      message: "You can't change your own role from here.",
    };
  }

  if (target.role === parsed.data.role) {
    return { ok: true, message: "Role already set to that." };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { role: parsed.data.role },
  });

  revalidateCustomer(target.id);
  return { ok: true, message: `Role updated to ${parsed.data.role}.` };
}

// ──────── send password-reset email via Supabase ─────────────────────

const ResetSchema = z.object({ userId: z.string().uuid() });

export async function sendPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = ResetSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { ok: false, message: "Invalid customer." };

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { email: true, deletedAt: true },
  });
  if (!user) return { ok: false, message: "Customer not found." };
  if (user.deletedAt) {
    return {
      ok: false,
      message: "Can't send a reset to a deleted customer.",
    };
  }

  // resetPasswordForEmail fires the magic email — Supabase hosts the
  // /reset page and redirects back to our site on success. We rely on
  // the existing auth.callback flow.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://asianbeautyshop.eu";
  const { error } = await supabaseAdmin().auth.resetPasswordForEmail(user.email, {
    redirectTo: `${origin}/en/account/reset`,
  });

  if (error) {
    return {
      ok: false,
      message: `Couldn't send reset email: ${error.message}`,
    };
  }

  return { ok: true, message: `Reset email sent to ${user.email}.` };
}

// ──────── soft delete (GDPR-compliant anonymisation) ────────────────

const DeleteSchema = z.object({
  userId: z.string().uuid(),
  confirm: z.literal("DELETE"),
});

export async function softDeleteCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = DeleteSchema.safeParse({
    userId: formData.get("userId"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Type "DELETE" to confirm.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true, deletedAt: true },
  });
  if (!user) return { ok: false, message: "Customer not found." };
  if (user.deletedAt) return { ok: false, message: "Already deleted." };
  if (actor.email && user.email.toLowerCase() === actor.email.toLowerCase()) {
    return { ok: false, message: "You can't delete your own admin account." };
  }

  // Anonymise identifying fields; keep the row so FK relations remain.
  // Email gets a placeholder that's still unique (needed because email has a
  // @unique constraint) but clearly marks the row as deleted.
  const shadowEmail = `deleted+${user.id}@asianbeautyshop.local`;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        email: shadowEmail,
        firstName: null,
        lastName: null,
        phone: null,
        marketingOptIn: false,
      },
    }),
    // Purge live addresses — they're only useful in context of a live
    // customer. Past orders still reference their frozen shipping/billing
    // address records so order history remains intact.
    prisma.address.deleteMany({ where: { userId: user.id } }),
    // Clear the cart/wishlist — nothing to deliver to a deleted user.
    prisma.cart.deleteMany({ where: { userId: user.id } }),
    prisma.wishlistItem.deleteMany({ where: { userId: user.id } }),
  ]);

  // Best-effort: also remove the Supabase auth user so they can't log in
  // with the old credentials. If the Supabase call fails we still keep the
  // DB soft-delete — better for the admin to see the row vanish from the
  // list than to be in a half-deleted state.
  try {
    await supabaseAdmin().auth.admin.deleteUser(user.id);
  } catch {
    // Swallow; the DB state is the source of truth.
  }

  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

// ──────── restore a soft-deleted customer ───────────────────────────
// Limited utility: we've wiped their identifying info, so restoring only
// makes sense if the admin needs to re-link legacy orders to a fresh
// profile. Kept for completeness; most shops never use it.

const RestoreSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email("Needs a fresh email to restore under"),
});

export async function restoreCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = RestoreSchema.safeParse({
    userId: formData.get("userId"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Enter a fresh email address to restore this customer.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, deletedAt: true },
  });
  if (!user) return { ok: false, message: "Customer not found." };
  if (!user.deletedAt) return { ok: false, message: "Customer isn't deleted." };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      deletedAt: null,
      email: parsed.data.email,
    },
  });

  revalidateCustomer(user.id);
  return { ok: true, message: "Customer restored." };
}
