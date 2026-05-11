// ─────────────────────────────────────────────────────────────────────────
// retryOrderPayment — G4: open a fresh Mollie payment for an order that
// failed / expired / cancelled the first time.
//
// Why this exists: Mollie payment URLs expire 24h after creation. A
// customer whose card was declined on day 1 and comes back on day 3 can't
// reuse `Order.molliePaymentUrl` — clicking it lands on a "payment
// expired" page. Pre-G4 the only path was to email the shop and ask for
// help (i.e. abandonment). This action creates a fresh payment against
// the same order (same publicNumber, same grandTotal, same metadata) and
// returns the new checkout URL.
//
// Gating: the action only proceeds if the order is in a state that
// genuinely needs a retry — PENDING status AND paymentStatus in
// FAILED / EXPIRED / CANCELED. PAID / SHIPPED / DELIVERED orders are
// obviously off-limits; UNPAID orders point at the original payment URL
// which may still be alive.
//
// Audit: every successful retry writes an OrderEvent with kind
// "payment.retried" so the admin timeline shows the customer kicked off
// a second attempt. Failures land as "payment.retry_failed".
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getMollie, mapLocaleToMollie } from "@/lib/mollie/client";
import { toMollieAmount } from "@/lib/checkout/pricing";
import { getCurrentUser } from "@/lib/auth";

/** Statuses that allow a retry — order isn't paid yet AND a previous
 *  attempt has definitively closed (failed / expired / cancelled). */
const RETRYABLE_PAYMENT_STATUSES = new Set([
  "FAILED",
  "EXPIRED",
  "CANCELED",
]);

export type RetryResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; reason: "not-found" | "not-retryable" | "provider-error" | "auth" };

/**
 * Server action — kicks off a fresh Mollie payment for the given order
 * and redirects the customer to Mollie's hosted page. On error returns
 * a structured result the caller can render inline.
 *
 * Identity check: the order must belong to the logged-in user. Guest
 * checkouts (no userId) are out of scope for the customer-facing retry
 * — those will need an admin "send pay link" feature (post-launch).
 */
export async function retryOrderPaymentAction(
  formData: FormData,
): Promise<RetryResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "auth" };

  const orderId = String(formData.get("orderId") ?? "");
  const locale = String(formData.get("locale") ?? "en").toLowerCase();

  if (!orderId) return { ok: false, reason: "not-found" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id },
    select: {
      id: true,
      publicNumber: true,
      status: true,
      paymentStatus: true,
      grandTotal: true,
      currency: true,
      email: true,
    },
  });
  if (!order) return { ok: false, reason: "not-found" };

  // Gating: PENDING status + retryable paymentStatus.
  if (
    order.status !== "PENDING" ||
    !RETRYABLE_PAYMENT_STATUSES.has(order.paymentStatus)
  ) {
    return { ok: false, reason: "not-retryable" };
  }

  // Build a fresh Mollie payment. Re-uses the same metadata + publicNumber
  // so the webhook still resolves to the same Order row when it fires.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://asianbeautyshop.eu";
  const webhookSecret =
    process.env.MOLLIE_WEBHOOK_SECRET ?? process.env.CRON_SECRET ?? "";
  const mollie = getMollie();

  let checkoutUrl: string | null = null;
  let mollieId: string | null = null;

  try {
    const payment = await mollie.payments.create({
      amount: {
        currency: order.currency,
        value: toMollieAmount(Number(order.grandTotal)),
      },
      description: `Asian Beauty Shop order ${order.publicNumber} (retry)`,
      redirectUrl: `${siteUrl}/${locale}/checkout/success?order=${encodeURIComponent(order.publicNumber)}`,
      cancelUrl: `${siteUrl}/${locale}/checkout/failure?order=${encodeURIComponent(order.publicNumber)}&reason=cancelled`,
      ...(siteUrl.startsWith("https://")
        ? {
            webhookUrl: `${siteUrl}/api/webhooks/mollie${webhookSecret ? `?token=${encodeURIComponent(webhookSecret)}` : ""}`,
          }
        : {}),
      locale: mapLocaleToMollie(locale),
      metadata: {
        orderId: order.id,
        publicNumber: order.publicNumber,
        retry: true,
      },
    });
    mollieId = payment.id;
    checkoutUrl = payment.getCheckoutUrl();
  } catch (err) {
    console.error("[retryOrderPayment] Mollie create failed", err);
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "payment.retry_failed",
        message: err instanceof Error ? err.message : "Unknown Mollie error",
      },
    });
    return { ok: false, reason: "provider-error" };
  }

  if (!checkoutUrl || !mollieId) {
    return { ok: false, reason: "provider-error" };
  }

  // Persist the new Mollie payment id + url so the order row's
  // "latest payment" pointers stay accurate. Reset paymentStatus to
  // UNPAID — once the customer lands on Mollie's hosted page, the
  // webhook will flip it back to FAILED/PAID/etc. based on outcome.
  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        mollieId,
        molliePaymentUrl: checkoutUrl,
        paymentStatus: "UNPAID",
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "payment.retried",
        message: `Customer kicked off a new Mollie payment (${mollieId})`,
        metadata: { mollieId, previousStatus: order.paymentStatus },
      },
    }),
  ]);

  // Revalidate the order detail page so when the customer returns
  // (success or another failure) the page shows fresh state.
  revalidatePath(`/${locale}/account/orders/${order.publicNumber}`);

  // Server-side redirect to Mollie's hosted payment page. This throws a
  // NEXT_REDIRECT internally — the function "returns" by navigating.
  redirect(checkoutUrl);
}
