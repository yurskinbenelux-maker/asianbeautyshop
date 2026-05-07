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
// so Sofia can't accidentally replace them with plain text and lose
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
 * Currently wired: order-confirmation. The other 17 transactional
 * emails follow the same 3-line pattern and can be added when the
 * client wants to tweak their copy.
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
    default:
      return null;
  }
}
