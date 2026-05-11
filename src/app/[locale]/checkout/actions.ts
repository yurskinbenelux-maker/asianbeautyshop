// ─────────────────────────────────────────────────────────────────────────
// Checkout server actions.
//
// One server action: submitCheckout(formData). Called by the checkout
// client form on submit. Validates with zod, resolves the current cart +
// user, calls placeOrder() which creates the Order and the Mollie
// payment, and returns { ok, checkoutUrl } for the client to redirect.
//
// No try/catch around placeOrder() swallowing errors here — we let them
// bubble as friendly error codes the UI knows how to translate.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { placeOrder } from "@/lib/checkout/place-order";
import { getCurrentCustomer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/log";

// ────────── schema ──────────────────────────────────────────────────────

const AddressSchema = z.object({
  firstName: z.string().trim().min(1, "first_name_required").max(80),
  lastName: z.string().trim().min(1, "last_name_required").max(80),
  company: z.string().trim().max(120).optional(),
  line1: z.string().trim().min(3, "line1_required").max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1, "city_required").max(80),
  postcode: z.string().trim().min(2, "postcode_required").max(16),
  region: z.string().trim().max(80).optional(),
  country: z
    .string()
    .trim()
    .length(2, "country_required")
    .transform((s) => s.toUpperCase()),
  phone: z.string().trim().max(32).optional(),
});

/**
 * Mollie payment methods we surface as quick-pick buttons. Empty string
 * = let Mollie's hosted page show its full method picker (the default).
 *
 * Slugs match Mollie's API exactly — see
 * https://docs.mollie.com/reference/v2/payments-api/create-payment#parameters
 * Adding a method here also requires an admin to enable it in the Mollie
 * Dashboard → Settings → Payment methods. We only surface methods that
 * make sense for our customer geography (BE / NL / FR / LU / DE).
 */
// NOT exported — Next.js requires "use server" files to export only
// async functions. Re-introducing an `export` here breaks every action
// in this module with "A 'use server' file can only export async
// functions, found object." If a sibling module ever needs this list,
// move it to a plain non-server file (e.g. lib/checkout/payment-methods.ts)
// and re-import.
const SUPPORTED_PAYMENT_METHODS = [
  "applepay",
  "googlepay",
  "bancontact",
  "ideal",
  "creditcard",
  "paypal",
] as const;
type SupportedPaymentMethod = (typeof SUPPORTED_PAYMENT_METHODS)[number];

/**
 * For a fully-digital cart (e.g. only gift cards), the customer fills
 * billing only and the shipping fields are blank. Make shipping optional
 * at the schema level so Zod doesn't reject — the server then re-derives
 * "is this digital-only?" from the cart contents and refuses if a
 * physical line snuck in without a shipping address.
 */
const OptionalAddressSchema = AddressSchema.partial().optional();

const CheckoutSchema = z.object({
  email: z.string().trim().toLowerCase().email("email_invalid"),
  shipping: OptionalAddressSchema,
  // Either a full billing address, or the sentinel "same" to clone shipping.
  billingSame: z.enum(["yes", "no"]).default("yes"),
  billing: AddressSchema.optional(),
  couponCode: z.string().trim().max(40).optional(),
  /**
   * Newline-separated GIFT- codes the customer applied via the field.
   * Re-validated server-side in placeOrder against fresh balances — the
   * client's preview total is just UX, never authoritative.
   */
  giftCardCodes: z
    .string()
    .trim()
    .max(400) // 8 codes * 14 chars, generous
    .optional(),
  notes: z.string().trim().max(1000).optional(),
  marketingOptIn: z.enum(["yes", "no"]).default("no"),
  locale: z.string().trim().length(2),
  /** Optional preferred Mollie method — if set, the hosted page lands
   *  directly on the wallet flow instead of showing the method picker. */
  paymentMethod: z
    .enum(SUPPORTED_PAYMENT_METHODS)
    .optional(),
});

export type SubmitCheckoutResult =
  | { ok: true; checkoutUrl: string; publicNumber: string }
  | { ok: false; error: CheckoutErrorCode; fieldErrors?: Record<string, string> };

export type CheckoutErrorCode =
  | "VALIDATION_FAILED"
  | "CART_EMPTY"
  | "NO_CART"
  | "COUNTRY_NOT_SHIPPABLE"
  | "CHECKOUT_UNAVAILABLE"
  | "GIFTCARD_INVALID"
  | "COUPON_EXHAUSTED"
  | "PAYMENT_PROVIDER_ERROR"
  | "UNKNOWN";

// ────────── action ──────────────────────────────────────────────────────

export async function submitCheckout(
  formData: FormData,
): Promise<SubmitCheckoutResult> {
  // ── DIAGNOSTIC INSTRUMENTATION (round 2) ───────────────────────────
  // The previous wrapper relied on logAudit + AuditLog, but no entry
  // surfaced — meaning either logAudit silently swallowed (it has its
  // own catch) OR Prisma write failed in this context.
  //
  // This version returns the error AS DATA so the client renders it
  // inline. an admin / Max sees the actual message on the checkout page
  // instead of a 500. Remove once the bug is identified.
  try {
    return await submitCheckoutInner(formData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort direct prisma write — bypasses logAudit's swallow.
    try {
      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorEmail: null,
          action: "checkout.500_diagnostic",
          entityType: "Cart",
          entityId: null,
          summary: `submitCheckout: ${message.slice(0, 400)}`,
          meta: {
            message,
            stack:
              (err instanceof Error ? err.stack ?? "" : "").slice(0, 3000),
          } as never,
          ip: null,
          userAgent: null,
        },
      });
    } catch (auditErr) {
      // eslint-disable-next-line no-console
      console.error("[submitCheckout] audit write failed", auditErr);
    }
    // CRITICAL: return as data instead of re-throwing. The client
    // renders this in the UI's error pill — Max can read the actual
    // message right on the checkout page. We tunnel the message
    // through error.UNKNOWN with the full text in a separate field
    // so legacy translations still resolve.
    // eslint-disable-next-line no-console
    console.error("[submitCheckout] threw (returning as data):", err);
    return {
      ok: false,
      error: "UNKNOWN",
      // Cast through unknown so the existing union type doesn't reject
      // the diagnostic field. Removed when this wrapper is reverted.
      ...({ debugMessage: message.slice(0, 500) } as Record<string, string>),
    } as SubmitCheckoutResult;
  }
}

async function submitCheckoutInner(
  formData: FormData,
): Promise<SubmitCheckoutResult> {
  // 1. Parse form data into a structured object — all nested fields are
  //    flat on FormData so we reach them by name convention ("shipping.line1").
  const rawMethod = formData.get("paymentMethod")?.toString();
  // Digital-only carts have NO shipping section — the customer fills the
  // billing block directly (it becomes the canonical address for invoice
  // + Mollie risk). The "billing same as shipping" toggle doesn't make
  // sense in that flow because there's no shipping address to mirror.
  // Without this branch the form submits billingSame=yes (the default),
  // the server then refuses to read billing.* from FormData, and the
  // downstream digital-only check at line ~249 bails with "billing_required"
  // — which surfaces as "Proceed to Mollie button does nothing."
  const cartIsDigitalOnlyHint =
    formData.get("cartIsDigitalOnly")?.toString() === "yes";
  const shouldReadBilling =
    cartIsDigitalOnlyHint ||
    formData.get("billingSame")?.toString() === "no";
  const raw = {
    email: formData.get("email")?.toString() ?? "",
    locale: formData.get("locale")?.toString() ?? "en",
    couponCode: formData.get("couponCode")?.toString() || undefined,
    giftCardCodes: formData.get("giftCardCodes")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined,
    marketingOptIn:
      formData.get("marketingOptIn")?.toString() === "yes" ? "yes" : "no",
    // For digital-only carts we force billingSame="no" so downstream
    // logic that mirrors shipping→billing doesn't fire (there's no
    // shipping address to mirror from).
    billingSame: cartIsDigitalOnlyHint
      ? "no"
      : formData.get("billingSame")?.toString() === "no"
        ? "no"
        : "yes",
    shipping: readAddress(formData, "shipping"),
    billing: shouldReadBilling
      ? readAddress(formData, "billing")
      : undefined,
    // Empty / unknown method strings stay undefined so Zod's enum doesn't
    // refuse the request — Mollie's full picker is the safe fallback.
    paymentMethod:
      rawMethod &&
      (SUPPORTED_PAYMENT_METHODS as readonly string[]).includes(rawMethod)
        ? rawMethod
        : undefined,
  };

  const parsed = CheckoutSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, error: "VALIDATION_FAILED", fieldErrors };
  }

  // 2. Resolve cart from the cookie + re-derive whether it's digital-only.
  // The client signals via a hidden field but we never trust the wire —
  // a tampered cart could otherwise skip the shipping address entirely
  // for a physical purchase.
  const jar = await cookies();
  const token = jar.get("cart_token")?.value;
  if (!token) return { ok: false, error: "NO_CART" };
  const cart = await prisma.cart.findUnique({
    where: { token },
    select: {
      id: true,
      items: {
        select: { product: { select: { kind: true } } },
      },
    },
  });
  if (!cart) return { ok: false, error: "NO_CART" };
  const isDigitalOnly =
    cart.items.length > 0 &&
    cart.items.every((i) => i.product.kind === "GIFT_CARD");

  // 3. Optional: current customer, for linking the order to an account.
  const current = await getCurrentCustomer();
  const userId = current?.profile.id ?? null;

  // 4. For digital-only carts the customer filled `billing.*` and left
  //    `shipping.*` blank. Promote billing → "the address" for the
  //    place-order call and don't pass a shipping address at all.
  // For physical / mixed carts the original flow stands: shipping is
  //    required, billing falls back to shipping when billingSame=yes.
  let shippingForOrder: typeof parsed.data.shipping | null = null;
  let billingForOrder: typeof parsed.data.billing | null = null;
  if (isDigitalOnly) {
    // The form rendered the billing block; if billing is missing here
    // it's a validation issue. Bail with a friendly error.
    if (!parsed.data.billing) {
      return {
        ok: false,
        error: "VALIDATION_FAILED",
        fieldErrors: { "billing.line1": "billing_required" },
      };
    }
    billingForOrder = parsed.data.billing;
    shippingForOrder = null;
  } else {
    // Physical / mixed: shipping is mandatory.
    if (!parsed.data.shipping || !parsed.data.shipping.line1) {
      return {
        ok: false,
        error: "VALIDATION_FAILED",
        fieldErrors: { "shipping.line1": "line1_required" },
      };
    }
    shippingForOrder = parsed.data.shipping;
    billingForOrder =
      parsed.data.billingSame === "no" ? parsed.data.billing ?? null : null;
  }

  // Fire placeOrder. Map any thrown business errors to known codes.
  try {
    const result = await placeOrder({
      cartId: cart.id,
      locale: parsed.data.locale,
      email: parsed.data.email,
      userId,
      paymentMethod: parsed.data.paymentMethod,
      shipping: shippingForOrder
        ? {
            firstName: shippingForOrder.firstName ?? "",
            lastName: shippingForOrder.lastName ?? "",
            company: shippingForOrder.company ?? null,
            line1: shippingForOrder.line1 ?? "",
            line2: shippingForOrder.line2 ?? null,
            city: shippingForOrder.city ?? "",
            postcode: shippingForOrder.postcode ?? "",
            region: shippingForOrder.region ?? null,
            country: shippingForOrder.country ?? "",
            phone: shippingForOrder.phone ?? null,
          }
        : null,
      billing: billingForOrder
        ? {
            firstName: billingForOrder.firstName,
            lastName: billingForOrder.lastName,
            company: billingForOrder.company ?? null,
            line1: billingForOrder.line1,
            line2: billingForOrder.line2 ?? null,
            city: billingForOrder.city,
            postcode: billingForOrder.postcode,
            region: billingForOrder.region ?? null,
            country: billingForOrder.country,
            phone: billingForOrder.phone ?? null,
          }
        : null,
      couponCode: parsed.data.couponCode ?? null,
      // Split + dedupe + uppercase each code. Empty array if none.
      giftCardCodes: parsed.data.giftCardCodes
        ? Array.from(
            new Set(
              parsed.data.giftCardCodes
                .split(/\s+/)
                .map((c) => c.trim().toUpperCase())
                .filter((c) => c.length > 0),
            ),
          )
        : [],
      notes: parsed.data.notes ?? null,
      marketingOptIn: parsed.data.marketingOptIn === "yes",
    });
    return {
      ok: true,
      checkoutUrl: result.checkoutUrl,
      publicNumber: result.publicNumber,
    };
  } catch (err) {
    const code = mapError(err);
    if (code === "UNKNOWN") {
      console.error("[submitCheckout] unexpected error", err);
    }
    return { ok: false, error: code };
  }
}

// ────────── helpers ─────────────────────────────────────────────────────

function readAddress(fd: FormData, prefix: string) {
  return {
    firstName: fd.get(`${prefix}.firstName`)?.toString() ?? "",
    lastName: fd.get(`${prefix}.lastName`)?.toString() ?? "",
    company: fd.get(`${prefix}.company`)?.toString() || undefined,
    line1: fd.get(`${prefix}.line1`)?.toString() ?? "",
    line2: fd.get(`${prefix}.line2`)?.toString() || undefined,
    city: fd.get(`${prefix}.city`)?.toString() ?? "",
    postcode: fd.get(`${prefix}.postcode`)?.toString() ?? "",
    region: fd.get(`${prefix}.region`)?.toString() || undefined,
    country: fd.get(`${prefix}.country`)?.toString() ?? "",
    phone: fd.get(`${prefix}.phone`)?.toString() || undefined,
  };
}

function mapError(err: unknown): CheckoutErrorCode {
  if (err instanceof Error) {
    if (err.message.startsWith("CART_EMPTY")) return "CART_EMPTY";
    if (err.message.startsWith("COUNTRY_NOT_SHIPPABLE")) {
      return "COUNTRY_NOT_SHIPPABLE";
    }
    if (err.message.startsWith("GIFTCARD_INVALID")) {
      return "GIFTCARD_INVALID";
    }
    if (err.message.startsWith("COUPON_EXHAUSTED")) {
      return "COUPON_EXHAUSTED";
    }
    if (err.message.startsWith("CHECKOUT_UNAVAILABLE")) {
      return "CHECKOUT_UNAVAILABLE";
    }
    if (err.message.startsWith("PAYMENT_PROVIDER_ERROR")) {
      return "PAYMENT_PROVIDER_ERROR";
    }
  }
  return "UNKNOWN";
}
