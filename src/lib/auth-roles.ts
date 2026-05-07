// ─────────────────────────────────────────────────────────────────────────
// Role granularity for the admin panel — server half.
//
// Pure types + the capability matrix + `hasCapability()` live in
// `./auth-roles-shared.ts` so client components (like the admin
// sidebar) can import them without dragging `next/headers` through
// the webpack graph. Everything in *this* file needs `getCurrentUser`
// / `redirect`, i.e. it is server-only.
//
// Context — why roles + capabilities exist:
//   The original `requireAdmin()` had a single allow-list
//   (ADMIN_ALLOWED_EMAILS). That's fine when it's just an admin, but as soon
//   as a freelancer helps with content or a VA helps with fulfilment, we
//   want to *not* hand them the settings panel, customer export, or the
//   ability to delete products.
//
//   Roles are allow-list-derived, **not** DB-derived. That means:
//     · No migration.
//     · Role assignment is an env-var edit (auditable via git/Hostinger).
//     · an admin never has to think about "user management UI" — it's a
//       config change the dev-of-record applies when needed.
//
// Three roles:
//   OWNER      — full access (the original ADMIN_ALLOWED_EMAILS list).
//                an admin + the dev-of-record (Max).
//   EDITOR     — content work: products, categories, banners, journal,
//                homepage copy, static pages, testimonials, ingredients,
//                media. Can read orders + customers (for context) but
//                cannot refund, export, or change financial settings.
//   FULFILMENT — operations work: orders, returns, inventory, contact
//                messages. Cannot edit products, content, or settings.
//
//   A user in multiple lists gets the *union* of capabilities.
//
// Env vars consumed:
//   ADMIN_ALLOWED_EMAILS      — owners (existing, parsed in ./auth)
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
//   // UI-level filtering (sidebar, buttons) — import from -shared:
//   import { hasCapability } from "@/lib/auth-roles-shared";
//   hasCapability(role, "settings.edit")
// ─────────────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getCurrentUser, isAdminEmail } from "./auth";
import {
  hasCapability,
  type AdminCapability,
  type AdminRole,
} from "./auth-roles-shared";

// Re-export the shared surface so existing callers that import from
// `@/lib/auth-roles` keep working — only client components need to
// switch to the -shared path to avoid the server bundle.
export {
  hasCapability,
  CAPS,
  type AdminRole,
  type AdminCapability,
} from "./auth-roles-shared";

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

// ─── server guards ───────────────────────────────────────────────────────

/**
 * Admin layout guard that also returns the resolved role. The layout
 * already gates "is this email in any admin list" via requireAdmin(); we
 * just look up the role.
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
