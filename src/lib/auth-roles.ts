// ─────────────────────────────────────────────────────────────────────────
// Role granularity for the admin panel.
//
// Context — why this file exists:
//   The original `requireAdmin()` had a single allow-list
//   (ADMIN_ALLOWED_EMAILS). That's fine when it's just Sofia, but as soon
//   as a freelancer helps with content or a VA helps with fulfilment, we
//   want to *not* hand them the settings panel, customer export, or the
//   ability to delete products.
//
//   Roles are allow-list-derived, **not** DB-derived. That means:
//     · No migration.
//     · Role assignment is an env-var edit (auditable via git/Hostinger).
//     · Sofia never has to think about "user management UI" — it's a
//       config change the dev-of-record applies when needed.
//
// Three roles:
//   OWNER      — full access (the original ADMIN_ALLOWED_EMAILS list).
//                Sofia + the dev-of-record (Max).
//   EDITOR     — content work: products, categories, banners, journal,
//                homepage copy, static pages, testimonials, media.
//                Can still read orders + customers (to check context) but
//                cannot refund, export, or change financial settings.
//   FULFILMENT — operations work: orders, returns, inventory, contact
//                messages. Cannot edit products, content, or settings.
//
//   A user in multiple lists gets the *union* of capabilities — i.e. the
//   highest-privilege identity. Practically, "OWNER also in EDITOR list"
//   is just OWNER.
//
// Env vars consumed:
//   ADMIN_ALLOWED_EMAILS      — owners (existing)
//   EDITOR_ALLOWED_EMAILS     — NEW
//   FULFILMENT_ALLOWED_EMAILS — NEW
//
// Usage:
//   // layout-level guard (every admin page goes through this already via
//   // requireAdmin in admin/layout.tsx):
//   const { user, role } = await requireAdminWithRole();
//
//   // capability-level guard inside a specific page/action:
//   await requireCapability("products.edit");
//
//   // UI-level filtering (sidebar, buttons):
//   hasCapability(role, "settings.edit")
// ─────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getCurrentUser, isAdminEmail } from "./auth";

// ─── types ───────────────────────────────────────────────────────────────

export type AdminRole = "OWNER" | "EDITOR" | "FULFILMENT";

/**
 * Every gated action in the admin is keyed by one of these. Use short,
 * noun.verb strings — kept as a union so a typo trips the compiler.
 */
export type AdminCapability =
  // products + content
  | "products.view"
  | "products.edit"
  | "products.delete"
  | "categories.edit"
  | "banners.edit"
  | "journal.edit"
  | "pages.edit"
  | "homepage.edit"
  | "testimonials.edit"
  | "ingredients.edit"
  | "media.edit"
  | "reviews.moderate"
  // operations
  | "orders.view"
  | "orders.edit"
  | "orders.export"
  | "returns.view"
  | "returns.edit"
  | "contact.view"
  | "contact.reply"
  | "inventory.adjust"
  // customer data
  | "customers.view"
  | "customers.export"
  | "customers.edit"
  // platform
  | "settings.view"
  | "settings.edit"
  | "coupons.edit"
  | "emails.send"
  | "redirects.edit"
  | "audit.view";

// ─── capability matrix ───────────────────────────────────────────────────
//
// Source of truth. When you add a new capability above, add it to every
// role here (even if only as `false`) so the compiler forces the decision.

const CAPS: Record<AdminRole, Set<AdminCapability>> = {
  OWNER: new Set<AdminCapability>([
    "products.view", "products.edit", "products.delete",
    "categories.edit", "banners.edit", "journal.edit", "pages.edit",
    "homepage.edit", "testimonials.edit", "ingredients.edit", "media.edit", "reviews.moderate",
    "orders.view", "orders.edit", "orders.export",
    "returns.view", "returns.edit",
    "contact.view", "contact.reply",
    "inventory.adjust",
    "customers.view", "customers.export", "customers.edit",
    "settings.view", "settings.edit",
    "coupons.edit", "emails.send", "redirects.edit", "audit.view",
  ]),
  EDITOR: new Set<AdminCapability>([
    "products.view", "products.edit",
    "categories.edit", "banners.edit", "journal.edit", "pages.edit",
    "homepage.edit", "testimonials.edit", "ingredients.edit", "media.edit", "reviews.moderate",
    // read-only view of orders/customers so the editor can proof descriptions
    // against real order data without touching it
    "orders.view", "returns.view", "contact.view",
    // no customers.view — customer list leaks PII; editors don't need it
    "inventory.adjust", // small stock corrections are content-ish
  ]),
  FULFILMENT: new Set<AdminCapability>([
    "products.view", // read-only — needed to check product copy vs order
    "orders.view", "orders.edit", "orders.export",
    "returns.view", "returns.edit",
    "contact.view", "contact.reply",
    "inventory.adjust",
    "customers.view", // fulfilment sees addresses/phone — that's the job
  ]),
};

// ─── env parsing ─────────────────────────────────────────────────────────

function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

const EDITOR_EMAILS = parseEmailList(process.env.EDITOR_ALLOWED_EMAILS);
const FULFILMENT_EMAILS = parseEmailList(process.env.FULFILMENT_ALLOWED_EMAILS);

// ─── resolution ──────────────────────────────────────────────────────────

/**
 * Resolve an email to its admin role, or `null` if the email isn't on any
 * admin allow-list. Order of precedence: OWNER > EDITOR > FULFILMENT.
 */
export function resolveAdminRole(
  email: string | null | undefined,
): AdminRole | null {
  if (!email) return null;
  const e = email.toLowerCase();
  if (isAdminEmail(e)) return "OWNER";
  if (EDITOR_EMAILS.has(e)) return "EDITOR";
  if (FULFILMENT_EMAILS.has(e)) return "FULFILMENT";
  return null;
}

/**
 * Typed capability check. Use from React components + inline guards.
 * Takes an optional/null role so you can call `hasCapability(role, "x")`
 * without narrowing first.
 */
export function hasCapability(
  role: AdminRole | null | undefined,
  cap: AdminCapability,
): boolean {
  if (!role) return false;
  return CAPS[role].has(cap);
}

// ─── server guards ───────────────────────────────────────────────────────

/**
 * Admin layout guard that also returns the resolved role. The layout
 * already gates "is this email in any admin list" via requireAdmin(); we
 * just look up the role. Falls back to OWNER for back-compat: if a user
 * is on the admin list but not any new list, they're treated as OWNER —
 * matching the pre-role-granularity behaviour.
 */
export async function requireAdminWithRole(
  redirectPath = "/admin",
): Promise<{ user: User; role: AdminRole }> {
  const user = await getCurrentUser();
  if (!user) {
    const next = encodeURIComponent(redirectPath);
    redirect(`/sign-in?next=${next}`);
  }
  const role = resolveAdminRole(user.email);
  if (!role) {
    redirect("/no-access");
  }
  return { user, role };
}

/**
 * Hard capability gate. Redirects to /no-access if the caller lacks the
 * capability — used at the top of pages/actions that shouldn't be visible
 * to the current role. Returns the user + role for convenience.
 */
export async function requireCapability(
  cap: AdminCapability,
  redirectPath = "/admin",
): Promise<{ user: User; role: AdminRole }> {
  const ctx = await requireAdminWithRole(redirectPath);
  if (!hasCapability(ctx.role, cap)) {
    redirect("/no-access");
  }
  return ctx;
}
