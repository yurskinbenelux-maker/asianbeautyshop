// ─────────────────────────────────────────────────────────────────────────
// Auth helpers — everything the app uses to know who's signed in.
//
//   Admin side (English, allow-listed emails, magic-link at /sign-in):
//     getCurrentUser()    — Supabase user or null, never throws
//     isAdminEmail()      — allow-list check against ADMIN_ALLOWED_EMAILS
//     requireAdmin()      — server-side guard for /admin pages
//
//   Customer side (email+password, localised at /[locale]/sign-in):
//     ensureUserProfile() — idempotent upsert of the Prisma User row so
//                            Supabase-auth users always have a matching
//                            profile with role/name/locale/preferences
//     getCurrentCustomer()— returns { supabase, profile } or null
//     requireCustomer()   — bounces to /[locale]/sign-in?next=… if not in
// ─────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Locale, Role, type User as DbUser } from "@prisma/client";
import { createSupabaseServerClient } from "./supabase/server";
import { prisma } from "./prisma";

/** Parse the comma-separated env var once and cache. */
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Use at the top of every admin page/action.
 * Redirects before rendering when the caller shouldn't be here.
 */
export async function requireAdmin(
  redirectPath = "/admin",
): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    // Preserve intended destination — we bounce back here after sign-in.
    const next = encodeURIComponent(redirectPath);
    redirect(`/sign-in?next=${next}`);
  }

  if (!isAdminEmail(user.email)) {
    redirect("/no-access");
  }

  return user;
}

// ─────────────────────────────────────────────────────────────────────────
//  CUSTOMER SIDE
// ─────────────────────────────────────────────────────────────────────────

/** Translate URL locale → Prisma enum.  Unknown falls back to EN. */
function toPrismaLocale(urlLocale: string | null | undefined): Locale {
  switch ((urlLocale ?? "").toLowerCase()) {
    case "nl":
      return Locale.NL;
    case "fr":
      return Locale.FR;
    case "ru":
      return Locale.RU;
    default:
      return Locale.EN;
  }
}

type ProfileHints = {
  firstName?: string | null;
  lastName?: string | null;
  preferredLocale?: Locale | null;
  marketingOptIn?: boolean | null;
};

/**
 * Idempotently ensure a Prisma User row exists for the given Supabase user,
 * with `id` matching `auth.users.id`.
 *
 * Safe to call on every request — it's a cheap single upsert. Role is set
 * to ADMIN for allow-listed emails, CUSTOMER otherwise.  If hints are
 * provided (e.g. during sign-up), they're used to populate the `create`
 * branch; on subsequent calls we only refresh mutable fields from Supabase
 * metadata (so renaming works from the admin later).
 */
export async function ensureUserProfile(
  supabaseUser: User,
  hints: ProfileHints = {},
): Promise<DbUser> {
  const email = (supabaseUser.email ?? "").toLowerCase();
  if (!email) {
    throw new Error("Supabase user has no email; cannot mirror to Prisma.");
  }

  const role = isAdminEmail(email) ? Role.ADMIN : Role.CUSTOMER;

  // Pull sign-up metadata if present (Supabase stores `options.data` here).
  const meta = supabaseUser.user_metadata as
    | { first_name?: string; last_name?: string }
    | undefined;

  const firstName =
    hints.firstName ?? meta?.first_name ?? null;
  const lastName =
    hints.lastName ?? meta?.last_name ?? null;

  const profile = await prisma.user.upsert({
    where: { id: supabaseUser.id },
    update: {
      email,
      // Keep role in sync so newly allow-listed emails become admin
      // on their next visit without a manual DB edit.
      role,
      // Only bump profile fields on update when we have a concrete hint
      // (i.e. user just submitted a profile form) — NOT from auth metadata.
      ...(hints.firstName !== undefined && { firstName: hints.firstName }),
      ...(hints.lastName !== undefined && { lastName: hints.lastName }),
      ...(hints.preferredLocale !== undefined && {
        preferredLocale: hints.preferredLocale ?? Locale.EN,
      }),
      ...(hints.marketingOptIn !== undefined && {
        marketingOptIn: hints.marketingOptIn ?? false,
        marketingOptInAt: hints.marketingOptIn ? new Date() : null,
      }),
    },
    create: {
      id: supabaseUser.id,
      email,
      role,
      firstName,
      lastName,
      preferredLocale: hints.preferredLocale ?? Locale.EN,
      marketingOptIn: hints.marketingOptIn ?? false,
      marketingOptInAt: hints.marketingOptIn ? new Date() : null,
      // Accepting T&Cs is required at sign-up form-level; we record the
      // timestamp whenever the profile is first created.
      acceptsTermsAt: new Date(),
    },
  });

  // YU.R Club: auto-create a LoyaltyAccount on first sight so the
  // customer's referral code exists the moment they hit /account. The
  // helper is idempotent — fast path (single SELECT) on subsequent
  // logins, and never throws into auth flow if it fails.
  if (profile.role === Role.CUSTOMER) {
    try {
      const { ensureLoyaltyAccount } = await import("@/lib/loyalty/account");
      await ensureLoyaltyAccount({
        userId: profile.id,
        firstName: profile.firstName,
      });
    } catch (err) {
      // Non-fatal — the customer can still sign in; the drawer's own
      // ensureLoyaltyAccount call will heal the account on first open.
      console.error("[auth] ensureLoyaltyAccount failed", profile.id, err);
    }
  }

  return profile;
}

/**
 * Return the signed-in customer + their Prisma profile, or null.
 * Ensures the profile exists (creates one on first access after a fresh
 * Supabase sign-up where the profile wasn't seeded yet).
 */
export async function getCurrentCustomer(): Promise<
  { supabase: User; profile: DbUser } | null
> {
  const supabase = await getCurrentUser();
  if (!supabase || !supabase.email) return null;
  const profile = await ensureUserProfile(supabase);
  return { supabase, profile };
}

/**
 * Guard for customer-facing account pages.  Redirects to locale-prefixed
 * /sign-in with `?next=` pointing back where they came from.
 *
 *   const { profile } = await requireCustomer({
 *     locale: "en",
 *     redirectTo: "/account/orders",
 *   });
 */
export async function requireCustomer(params: {
  locale: string;
  redirectTo: string; // relative to the locale root, e.g. "/account"
}): Promise<{ supabase: User; profile: DbUser }> {
  const current = await getCurrentCustomer();
  if (!current) {
    const next = encodeURIComponent(`/${params.locale}${params.redirectTo}`);
    redirect(`/${params.locale}/sign-in?next=${next}`);
  }
  return current;
}

/** Re-exported so call-sites don't need their own locale helper. */
export { toPrismaLocale };
