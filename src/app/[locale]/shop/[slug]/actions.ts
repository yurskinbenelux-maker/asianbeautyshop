// ─────────────────────────────────────────────────────────────────────────
// Public PDP server actions.
//
// Currently houses the back-in-stock subscribe action — when a variant
// is out of stock, customers leave their email and we email them once
// when stock returns. Idempotent on (email, variantId): re-submitting is
// a no-op (no double notify, no error toast).
//
// No auth gate — these are public-facing forms. Validation is via Zod
// and we accept anything that looks like a real email.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { z } from "zod";
import { Locale, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SubscribeResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; message: string };

const SubscribeSchema = z.object({
  variantId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  locale: z.nativeEnum(Locale),
});

/**
 * Subscribe an email to back-in-stock notifications for a specific variant.
 * Idempotent — re-submitting the same email + variant returns
 * `alreadySubscribed: true` without throwing or queuing a duplicate row.
 *
 * If the variant currently HAS stock, we still record the subscription
 * (rare race, but cheap) — the cron's check is point-in-time so the row
 * just won't fire until stock dips and recovers.
 */
export async function subscribeBackInStockAction(
  _prev: SubscribeResult | null,
  formData: FormData,
): Promise<SubscribeResult> {
  const parsed = SubscribeSchema.safeParse({
    variantId: formData.get("variantId"),
    email: formData.get("email"),
    locale: formData.get("locale"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please enter a valid email address.",
    };
  }

  const { variantId, email, locale } = parsed.data;

  // Belt-and-braces: confirm the variant exists and isn't archived.
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, productId: true },
  });
  if (!variant) {
    return { ok: false, message: "Product variant not found." };
  }

  try {
    const existing = await prisma.backInStockSubscription.findUnique({
      where: { email_variantId: { email, variantId } },
      select: { id: true, notifiedAt: true },
    });

    if (existing) {
      // If we already notified, allow re-subscription by clearing
      // notifiedAt so the next stock-up will notify again.
      if (existing.notifiedAt) {
        await prisma.backInStockSubscription.update({
          where: { id: existing.id },
          data: { notifiedAt: null, locale },
        });
      }
      return { ok: true, alreadySubscribed: true };
    }

    await prisma.backInStockSubscription.create({
      data: { email, variantId, locale },
    });
    return { ok: true, alreadySubscribed: false };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Race: another request beat us to the insert. Treat as success.
      return { ok: true, alreadySubscribed: true };
    }
    console.error("[subscribeBackInStockAction] failed", err);
    return {
      ok: false,
      message: "Couldn't save your email. Please try again.",
    };
  }
}
