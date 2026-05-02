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
 * Adding a method here also requires Sofia to enable it in the Mollie
 * Dashboard → Settings → Payment methods. We only surface methods that
 * make sense for our customer geography (BE / NL / FR / LU / DE).
 */
export const SUPPORTED_PAYMENT_METHODS = [
  "applepay",
  "googlepay",
  "bancontact",
  "ideal",
  "creditcard",
  "paypal",
] as const;
export type SupportedPaymentMethod =
  (typeof SUPPORTED_PAYMENT_METHODS)[number];

const CheckoutSchema = z.object({
  email: z.string().trim().toLowerCase().email("email_invalid"),
  shipping: AddressSchema,
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
  | "PAYMENT_PROVIDER_ERROR"
  | "UNKNOWN";

// ────────── action ──────────────────────────────────────────────────────

export async function submitCheckout(
  formData: FormData,
): Promise<SubmitCheckoutResult> {
  // 1. Parse form data into a structured object — all nested fields are
  //    flat on FormData so we reach them by name convention ("shipping.line1").
  const rawMethod = formData.get("paymentMethod")?.toString();
  const raw = {
    email: formData.get("email")?.toString() ?? "",
    locale: formData.get("locale")?.toString() ?? "en",
    couponCode: formData.get("couponCode")?.toString() || undefined,
    giftCardCodes: formData.get("giftCardCodes")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined,
    marketingOptIn:
      formData.get("marketingOptIn")?.toString() === "yes" ? "yes" : "no",
    billingSame:
      formData.get("billingSame")?.toString() === "no" ? "no" : "yes",
    shipping: readAddress(formData, "shipping"),
    billing:
      formData.get("billingSame")?.toString() === "no"
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

  // 2. Resolve cart from the cookie.
  const jar = await cookies();
  const token = jar.get("cart_token")?.value;
  if (!token) return { ok: false, error: "NO_CART" };
  const cart = await prisma.cart.findUnique({
    where: { token },
    select: { id: true },
  });
  if (!cart) return { ok: false, error: "NO_CART" };

  // 3. Optional: current customer, for linking the order to an account.
  const current = await getCurrentCustomer();
  const userId = current?.profile.id ?? null;

  // 4. Fire placeOrder. Map any thrown business errors to known codes.
  try {
    const result = await placeOrder({
      cartId: cart.id,
      locale: parsed.data.locale,
      email: parsed.data.email,
      userId,
      paymentMethod: parsed.data.paymentMethod,
      shipping: {
        firstName: parsed.data.shipping.firstName,
        lastName: parsed.data.shipping.lastName,
        company: parsed.data.shipping.company ?? null,
        line1: parsed.data.shipping.line1,
        line2: parsed.data.shipping.line2 ?? null,
        city: parsed.data.shipping.city,
        postcode: parsed.data.shipping.postcode,
        region: parsed.data.shipping.region ?? null,
        country: parsed.data.shipping.country,
        phone: parsed.data.shipping.phone ?? null,
      },
      billing:
        parsed.data.billingSame === "no" && parsed.data.billing
          ? {
              firstName: parsed.data.billing.firstName,
              lastName: parsed.data.billing.lastName,
              company: parsed.data.billing.company ?? null,
              line1: parsed.data.billing.line1,
              line2: parsed.data.billing.line2 ?? null,
              city: parsed.data.billing.city,
              postcode: parsed.data.billing.postcode,
              region: parsed.data.billing.region ?? null,
              country: parsed.data.billing.country,
              phone: parsed.data.billing.phone ?? null,
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
    if (err.message.startsWith("CHECKOUT_UNAVAILABLE")) {
      return "CHECKOUT_UNAVAILABLE";
    }
    if (err.message.startsWith("PAYMENT_PROVIDER_ERROR")) {
      return "PAYMENT_PROVIDER_ERROR";
    }
  }
  return "UNKNOWN";
}
