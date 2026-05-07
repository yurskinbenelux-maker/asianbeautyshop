// ─────────────────────────────────────────────────────────────────────────
// auth-roles-shared — the client-safe half of the role system.
//
// Why this file exists:
//   `auth-roles.ts` pulls in `./auth` which in turn pulls in
//   `./supabase/server` which uses `next/headers` — hard server-only.
//   Any client component that needs types or `hasCapability()` blew up
//   the webpack build (see the admin sidebar regression on 2026-04-23).
//
//   This file has *no* imports from anything server-flavoured. Client
//   and server code both import from here; the server-only guards
//   (`resolveAdminRole`, `requireAdminWithRole`, `requireCapability`)
//   stay in `auth-roles.ts` which re-exports from here.
// ─────────────────────────────────────────────────────────────────────────

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
  | "giftcards.view"
  | "giftcards.manage"
  | "emails.send"
  | "redirects.edit"
  | "audit.view"
  // A-Beauty Club loyalty config — money-coded (an admin tweaks pts/€, redemption
  // costs, milestone bonuses), so OWNER-only by default.
  | "loyalty.edit";

// ─── capability matrix ───────────────────────────────────────────────────
//
// Source of truth. When you add a new capability above, add it to every
// role here (even if only as `false`) so the compiler forces the decision.

export const CAPS: Record<AdminRole, Set<AdminCapability>> = {
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
    "coupons.edit", "giftcards.view", "giftcards.manage",
    "emails.send", "redirects.edit", "audit.view",
    "loyalty.edit",
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
    "giftcards.view", // read-only so they can answer "did the card go through"
  ]),
};

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
