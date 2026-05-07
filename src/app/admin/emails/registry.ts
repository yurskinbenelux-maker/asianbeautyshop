// ─────────────────────────────────────────────────────────────────────────
// Email template registry — every template that's available in the
// /admin/emails preview. Adding a new one means:
//   1. create the builder in src/lib/email/…
//   2. add a fixture in ./fixtures.ts
//   3. register it here
//
// We keep this file server-only (no "use client") because the builders
// import stuff like @/lib/email/* which transitively pull in env/Resend.
// The preview pages are all server components; they call render() and
// hand the HTML to an iframe srcDoc.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import type { EmailOverrides } from "@/lib/email/copy-overrides";
import { buildOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { buildOrderShippedEmail } from "@/lib/email/order-shipped";
import { buildOrderCancelledEmail } from "@/lib/email/order-cancelled";
import { buildOrderRefundedEmail } from "@/lib/email/order-refunded";
import { buildReviewRequestEmail } from "@/lib/email/review-request";
import { buildAbandonedCartEmail } from "@/lib/email/abandoned-cart";
import { buildLowStockEmail } from "@/lib/email/low-stock-alert";
import {
  buildAuthConfirmEmail,
  buildAuthConfirmEmailMultiLocale,
} from "@/lib/email/auth-confirm";
import { buildAuthMagicLinkEmail } from "@/lib/email/auth-magic-link";
import {
  buildAuthResetPasswordEmail,
  buildAuthResetPasswordEmailMultiLocale,
} from "@/lib/email/auth-reset-password";
import {
  buildAuthChangeEmailEmail,
  buildAuthChangeEmailEmailMultiLocale,
} from "@/lib/email/auth-change-email";
import { buildConfirmationEmail } from "@/lib/newsletter/confirmation-email";
import {
  fixtureAbandonedCart,
  fixtureLowStockReport,
  fixtureOrder,
} from "./fixtures";

export type EmailAudience = "customer" | "admin";

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type EmailTemplate = {
  /** URL-safe slug. Used in /admin/emails/[key]. */
  key: string;
  /** Human label for the index page and breadcrumbs. */
  label: string;
  /** Short one-liner describing WHEN the email is sent. */
  description: string;
  /** Who receives this — customer vs. Sofia. Drives colour + icon. */
  audience: EmailAudience;
  /**
   * When true, the preview page exposes a locale switcher (EN/NL/FR/RU).
   * Admin-only emails are English-only — the switcher is hidden.
   */
  localised: boolean;
  /**
   * Pure render function. Must be safe to call with any locale.
   * Returning null means "this template has nothing to say for the
   * current fixture" (e.g. empty low-stock report).
   *
   * `overrides` (optional) lets the editor preview show admin-edited
   * copy live as Sofia types. Templates that don't accept overrides
   * yet ignore the parameter — they just render their defaults.
   */
  render: (locale: Locale, overrides?: EmailOverrides) => RenderedEmail | null;
};

/**
 * The ordered list of templates Sofia can preview. Ordering matters —
 * the grid on the index page follows this order (customer first, then
 * admin). Grouping handled in the page itself.
 */
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: "auth-confirm",
    label: "Account confirmation (per-locale preview)",
    description:
      "Per-locale preview of the YU.R-branded confirm-signup email. Supabase only ships ONE template at a time — for production, use the 'Account confirmation (multilingual)' entry below instead.",
    audience: "customer",
    localised: true,
    render: (locale) => {
      const r = buildAuthConfirmEmail(locale);
      return { subject: r.subject, html: r.html, text: r.text };
    },
  },
  {
    key: "auth-confirm-multilingual",
    label: "Account confirmation (multilingual)",
    description:
      "THIS is the version you paste into Supabase → Authentication → Email Templates → Confirm signup. It contains all 4 languages wrapped in Go-template conditionals; Supabase picks the right one at send time based on the customer's signup locale (defaults to EN if unknown). Mustache tokens like {{ .TokenHash }} appear unrendered in this preview — that's expected.",
    audience: "customer",
    localised: false,
    render: () => {
      const r = buildAuthConfirmEmailMultiLocale();
      return { subject: r.subject, html: r.html, text: r.text };
    },
  },
  {
    key: "auth-magic-link",
    label: "Admin sign-in (magic link)",
    description:
      "Sent when an admin types their email at /sign-in. EN-only — admins are Belgium-based and signInWithOtp doesn't accept locale metadata. Paste this HTML into Supabase → Authentication → Email Templates → Magic link.",
    audience: "admin",
    localised: false,
    render: () => {
      const r = buildAuthMagicLinkEmail();
      return { subject: r.subject, html: r.html, text: r.text };
    },
  },
  {
    key: "auth-reset-password",
    label: "Reset password (per-locale preview)",
    description:
      "Per-locale preview only — the multilingual entry below is what actually goes into Supabase.",
    audience: "customer",
    localised: true,
    render: (locale) => {
      const r = buildAuthResetPasswordEmail(locale);
      return { subject: r.subject, html: r.html, text: r.text };
    },
  },
  {
    key: "auth-reset-password-multilingual",
    label: "Reset password (multilingual)",
    description:
      "Paste this HTML into Supabase → Authentication → Email Templates → Reset password. Contains all 4 languages; Supabase picks one based on the customer's signup locale.",
    audience: "customer",
    localised: false,
    render: () => {
      const r = buildAuthResetPasswordEmailMultiLocale();
      return { subject: r.subject, html: r.html, text: r.text };
    },
  },
  {
    key: "auth-change-email",
    label: "Change email address (per-locale preview)",
    description:
      "Per-locale preview only — the multilingual entry below is what actually goes into Supabase.",
    audience: "customer",
    localised: true,
    render: (locale) => {
      const r = buildAuthChangeEmailEmail(locale);
      return { subject: r.subject, html: r.html, text: r.text };
    },
  },
  {
    key: "auth-change-email-multilingual",
    label: "Change email address (multilingual)",
    description:
      "Paste this HTML into Supabase → Authentication → Email Templates → Change email address. Contains all 4 languages; Supabase picks one based on the customer's signup locale.",
    audience: "customer",
    localised: false,
    render: () => {
      const r = buildAuthChangeEmailEmailMultiLocale();
      return { subject: r.subject, html: r.html, text: r.text };
    },
  },
  {
    key: "newsletter-confirm",
    label: "Newsletter — confirm subscription",
    description:
      "Sent the moment someone enters their email in the newsletter form (footer or exit-intent). Double opt-in: nothing happens to the subscriber list until they click.",
    audience: "customer",
    localised: true,
    render: (locale) =>
      buildConfirmationEmail({
        confirmUrl: "https://yurskinsolution.eu/api/newsletter/confirm?t=preview",
        locale,
      }),
  },
  {
    key: "order-confirmation",
    label: "Order confirmation",
    description: "Sent to the customer the moment payment is confirmed.",
    audience: "customer",
    localised: true,
    render: (locale, overrides) =>
      buildOrderConfirmationEmail(fixtureOrder(locale), { overrides }),
  },
  {
    key: "order-shipped",
    label: "Order shipped",
    description: "Sent when you mark an order as Shipped in admin.",
    audience: "customer",
    localised: true,
    render: (locale) => buildOrderShippedEmail(fixtureOrder(locale)),
  },
  {
    key: "order-cancelled",
    label: "Order cancelled",
    description: "Sent when an order is cancelled before shipping.",
    audience: "customer",
    localised: true,
    render: (locale) => buildOrderCancelledEmail(fixtureOrder(locale)),
  },
  {
    key: "order-refunded",
    label: "Order refunded (full)",
    description:
      "Sent after a full refund is issued. Partial-refund preview is on the roadmap.",
    audience: "customer",
    localised: true,
    render: (locale) =>
      buildOrderRefundedEmail(fixtureOrder(locale), {
        amount: 84.95,
        kind: "full",
      }),
  },
  {
    key: "review-request",
    label: "Post-purchase review request",
    description:
      "Sent ~14 days after delivery asking the customer for a review.",
    audience: "customer",
    localised: true,
    render: (locale) => buildReviewRequestEmail(fixtureOrder(locale)),
  },
  {
    key: "abandoned-cart",
    label: "Abandoned cart reminder",
    description:
      "Sent by the daily cron to customers who left items in their bag.",
    audience: "customer",
    localised: true,
    render: (locale) => buildAbandonedCartEmail(fixtureAbandonedCart(locale)),
  },
  {
    key: "low-stock-alert",
    label: "Low-stock alert",
    description:
      "Internal digest sent to the admin inbox when SKUs drop below the threshold.",
    audience: "admin",
    localised: false,
    render: () => buildLowStockEmail(fixtureLowStockReport()),
  },
];

/** Lookup by key. Returns undefined if the key isn't in the registry. */
export function getEmailTemplate(key: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.key === key);
}

/** All locales the preview supports — used to render the switcher. */
export const PREVIEW_LOCALES: Locale[] = [
  Locale.EN,
  Locale.NL,
  Locale.FR,
  Locale.RU,
];
