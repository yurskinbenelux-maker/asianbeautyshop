// ─────────────────────────────────────────────────────────────────────────
// Email field metadata — used by /admin/emails/[key]/edit to build the
// per-locale editor.
//
// Each email's STRINGS shape is unique. Rather than reflectively
// introspect the STRINGS objects (TypeScript can't reach them at
// runtime), we declare here which fields are user-editable and which
// are dynamic (function-typed).
//
// Adding a new email to the editor (5-min recipe):
//   1. In the email's TS file:
//        a. Rename `const STRINGS:` to `export const XXX_STRINGS:`
//        b. Add `import { applyOverrides, getEmailOverrides, type EmailOverrides } from "./copy-overrides";`
//        c. Change the `buildXxx()` signature to accept `options?: { overrides?: EmailOverrides }`
//        d. Replace `const s = STRINGS[locale] ?? STRINGS.EN` with
//           `const s = applyOverrides(XXX_STRINGS[locale] ?? XXX_STRINGS.EN, options?.overrides)`
//        e. In the `sendXxx()` function, fetch overrides + pass through:
//           `const overrides = await getEmailOverrides("xxx-key", locale);`
//           `... = buildXxx(arg, { overrides });`
//   2. Add an entry to FIELD_META below describing the editable fields
//   3. Add a case to `loadStringsTable()` that imports the renamed STRINGS
//
// Function-typed fields (`subject: (orderNo) => string`) MUST be marked
// `kind: "dynamic"` — the editor renders those read-only with a warning
// so an admin can't accidentally replace them with plain text and lose
// her order-number / first-name interpolations.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";

export type EmailFieldKind = "short" | "long" | "dynamic";

export type EmailFieldDescriptor = {
  /** Matches the key inside the email's STRINGS<Strings> object. */
  key: string;
  /** Human label shown in the editor header. */
  label: string;
  /** Optional one-line hint shown beneath the input. */
  hint?: string;
  /** Drives the rendering: short = single-line input, long = textarea,
   *  dynamic = read-only with a "contains dynamic placeholders" warning. */
  kind: EmailFieldKind;
};

/**
 * Registry of editable fields per email. Only emails listed here get
 * an "Edit copy" button on /admin/emails. Order matters — the editor
 * renders fields top-to-bottom in this order.
 *
 * Currently wired: order-confirmation, order-shipped, order-cancelled,
 * order-refunded, review-request, abandoned-cart, newsletter-confirm.
 * Auth-* templates and the multilingual variants are paste-to-Supabase
 * — they don't go through our send pipeline so overrides wouldn't
 * apply. Low-stock-alert + admin-only emails stay EN-only in code.
 */
export const FIELD_META: Record<string, EmailFieldDescriptor[]> = {
  "order-confirmation": [
    { key: "subject", label: "Subject", kind: "dynamic", hint: "Contains the order number — managed in code." },
    { key: "preheader", label: "Preheader (preview text)", kind: "short" },
    { key: "heading", label: "Heading", kind: "dynamic", hint: "Greets the customer by first name — managed in code." },
    { key: "lede", label: "Lede paragraph", kind: "long" },
    { key: "ledeDigital", label: "Lede (digital orders)", kind: "long", hint: "Shown when the order is gift-card-only." },
    { key: "orderLabel", label: "Order label", kind: "short" },
    { key: "itemsLabel", label: "Items section heading", kind: "short" },
    { key: "subtotalLabel", label: "Subtotal label", kind: "short" },
    { key: "discountLabel", label: "Discount label", kind: "short" },
    { key: "shippingLabel", label: "Shipping label", kind: "short" },
    { key: "taxLabel", label: "Tax label", kind: "short" },
    { key: "totalLabel", label: "Total label", kind: "short" },
    { key: "shippingAddressLabel", label: "Shipping address label", kind: "short" },
    { key: "nextLabel", label: "Next-step heading", kind: "short" },
    { key: "nextBody", label: "Next-step body", kind: "long" },
    { key: "nextBodyDigital", label: "Next-step body (digital orders)", kind: "long" },
    { key: "cta", label: "Call-to-action button", kind: "short" },
    { key: "signoff", label: "Sign-off", kind: "long", hint: "Use \\n for line breaks." },
    { key: "footer", label: "Legal footer line", kind: "short" },
  ],
  "order-shipped": [
    { key: "subject", label: "Subject", kind: "dynamic", hint: "Contains the order number — managed in code." },
    { key: "preheader", label: "Preheader (preview text)", kind: "short" },
    { key: "heading", label: "Heading", kind: "dynamic", hint: "Greets the customer by first name — managed in code." },
    { key: "lede", label: "Lede paragraph (when tracking is available)", kind: "long" },
    { key: "trackingLabel", label: "Tracking number label", kind: "short" },
    { key: "noTrackingLede", label: "Lede paragraph (no tracking yet)", kind: "long" },
    { key: "cta", label: "Call-to-action button", kind: "short" },
    { key: "signoff", label: "Sign-off", kind: "long" },
    { key: "footer", label: "Legal footer line", kind: "short" },
  ],
  "order-cancelled": [
    { key: "subject", label: "Subject", kind: "dynamic", hint: "Contains the order number — managed in code." },
    { key: "preheader", label: "Preheader (preview text)", kind: "short" },
    { key: "heading", label: "Heading", kind: "dynamic", hint: "Greets the customer by first name — managed in code." },
    { key: "lede", label: "Lede paragraph", kind: "long" },
    { key: "refundNote", label: "Refund note", kind: "long", hint: "Explains when/how the refund will appear." },
    { key: "cta", label: "Call-to-action button", kind: "short" },
    { key: "signoff", label: "Sign-off", kind: "long" },
    { key: "footer", label: "Legal footer line", kind: "short" },
  ],
  "order-refunded": [
    { key: "subject", label: "Subject", kind: "dynamic", hint: "Branches on full vs. partial refund + order number — managed in code." },
    { key: "preheader", label: "Preheader", kind: "dynamic", hint: "Branches on full vs. partial refund — managed in code." },
    { key: "heading", label: "Heading", kind: "dynamic", hint: "Greets by first name + branches on refund kind — managed in code." },
    { key: "ledeFull", label: "Lede paragraph (full refund)", kind: "long" },
    { key: "ledePartial", label: "Lede paragraph (partial refund)", kind: "long" },
    { key: "amountLabel", label: "Refunded amount label", kind: "short" },
    { key: "timingNote", label: "Timing note", kind: "long", hint: "When the customer should expect to see the money back." },
    { key: "cta", label: "Call-to-action button", kind: "short" },
    { key: "signoff", label: "Sign-off", kind: "long" },
    { key: "footer", label: "Legal footer line", kind: "short" },
  ],
  "review-request": [
    { key: "subject", label: "Subject", kind: "dynamic", hint: "Contains the order number — managed in code." },
    { key: "preheader", label: "Preheader (preview text)", kind: "short" },
    { key: "heading", label: "Heading", kind: "dynamic", hint: "Greets the customer by first name — managed in code." },
    { key: "lede", label: "Lede paragraph", kind: "long" },
    { key: "incentive", label: "Incentive line", kind: "long", hint: "Optional perk for leaving a review." },
    { key: "cta", label: "Call-to-action button", kind: "short" },
    { key: "signoff", label: "Sign-off", kind: "long" },
    { key: "footer", label: "Legal footer line", kind: "short" },
  ],
  "abandoned-cart": [
    { key: "subject", label: "Subject", kind: "short" },
    { key: "preheader", label: "Preheader (preview text)", kind: "short" },
    { key: "heading", label: "Heading", kind: "dynamic", hint: "Greets the customer by first name — managed in code." },
    { key: "lede", label: "Lede paragraph", kind: "long" },
    { key: "cta", label: "Call-to-action button", kind: "short" },
    { key: "signoff", label: "Sign-off", kind: "long" },
    { key: "footer", label: "Legal footer line", kind: "short" },
    { key: "andMore", label: "\"And N more items\" line", kind: "dynamic", hint: "Inserts the remaining-item count — managed in code." },
  ],
  "newsletter-confirm": [
    { key: "subject", label: "Subject", kind: "short" },
    { key: "preheader", label: "Preheader (preview text)", kind: "short" },
    { key: "greeting", label: "Greeting", kind: "short" },
    { key: "lede", label: "Lede paragraph", kind: "long" },
    { key: "cta", label: "Call-to-action button", kind: "short" },
    { key: "alt", label: "Fallback link line", kind: "long", hint: "Shown if the CTA button doesn't work." },
    { key: "signoff", label: "Sign-off", kind: "short" },
    { key: "disclaimer", label: "GDPR disclaimer", kind: "long", hint: "Explains why the customer received this email." },
  ],
};

/** Returns the metadata for an email key, or null if it isn't editable yet. */
export function getFieldMeta(emailKey: string): EmailFieldDescriptor[] | null {
  return FIELD_META[emailKey] ?? null;
}

/** Used by the index page to decide whether to show an "Edit copy" link. */
export function hasEditableCopy(emailKey: string): boolean {
  return emailKey in FIELD_META;
}

// ─────────────────────────────────────────────────────────────────────────
// Default-copy reader — pulls live default values out of each email's
// STRINGS object so the editor always shows the up-to-date hardcoded
// text. Centralised here so the editor doesn't need to import every
// email's STRINGS table directly.
// ─────────────────────────────────────────────────────────────────────────

export type DefaultStringsByLocale = Record<Locale, Record<string, string>>;

export async function getDefaultStrings(
  emailKey: string,
): Promise<DefaultStringsByLocale | null> {
  const stringsTable = await loadStringsTable(emailKey);
  if (!stringsTable) return null;

  const result: DefaultStringsByLocale = {
    [Locale.EN]: {},
    [Locale.NL]: {},
    [Locale.FR]: {},
    [Locale.RU]: {},
  };
  for (const loc of [Locale.EN, Locale.NL, Locale.FR, Locale.RU]) {
    const block = stringsTable[loc] ?? {};
    for (const [k, v] of Object.entries(block)) {
      if (typeof v === "string") {
        result[loc][k] = v;
      }
    }
  }
  return result;
}

async function loadStringsTable(
  emailKey: string,
): Promise<Record<Locale, Record<string, unknown>> | null> {
  switch (emailKey) {
    case "order-confirmation":
      return (await import("@/lib/email/order-confirmation"))
        .ORDER_CONFIRMATION_STRINGS as never;
    case "order-shipped":
      return (await import("@/lib/email/order-shipped"))
        .ORDER_SHIPPED_STRINGS as never;
    case "order-cancelled":
      return (await import("@/lib/email/order-cancelled"))
        .ORDER_CANCELLED_STRINGS as never;
    case "order-refunded":
      return (await import("@/lib/email/order-refunded"))
        .ORDER_REFUNDED_STRINGS as never;
    case "review-request":
      return (await import("@/lib/email/review-request"))
        .REVIEW_REQUEST_STRINGS as never;
    case "abandoned-cart":
      return (await import("@/lib/email/abandoned-cart"))
        .ABANDONED_CART_STRINGS as never;
    case "newsletter-confirm":
      return (await import("@/lib/newsletter/confirmation-email"))
        .NEWSLETTER_CONFIRM_STRINGS as never;
    default:
      return null;
  }
}
