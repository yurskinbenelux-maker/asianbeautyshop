// ─────────────────────────────────────────────────────────────────────────
// reorderAction — one-click add-everything-from-this-order to the cart.
//
// Flow:
//   1. Verify caller owns the order.
//   2. Walk every line item. For each, check the underlying Product
//      (and Variant, if any) is still purchasable.
//   3. Add each surviving line to the cart at its original quantity.
//   4. Open the cart drawer on success so the customer sees the result.
//
// Items that can't be re-added (archived product, deleted variant,
// out-of-stock variant) are returned as a `skipped` list so the UI
// can show "Added X items, Y unavailable — see them →".
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { addItem } from "@/lib/cart/cart";
import { getMyOrderByNumber } from "@/lib/queries/orders";

const URL_LOCALE_TO_PRISMA = {
  en: "EN",
  nl: "NL",
  fr: "FR",
  ru: "RU",
} as const;

export type ReorderResult =
  | {
      ok: true;
      added: number;
      skipped: Array<{ name: string; reason: "unavailable" | "out-of-stock" }>;
    }
  | { ok: false; reason: "order-not-found" | "no-items" };

export async function reorderAction(
  prev: ReorderResult | null,
  formData: FormData,
): Promise<ReorderResult> {
  const locale = String(formData.get("locale") ?? "en");
  const orderNumber = String(formData.get("orderNumber") ?? "");
  if (!orderNumber) return { ok: false, reason: "order-not-found" };

  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/orders/${orderNumber}`,
  });

  const order = await getMyOrderByNumber(profile.id, orderNumber, locale);
  if (!order) return { ok: false, reason: "order-not-found" };
  if (order.items.length === 0) return { ok: false, reason: "no-items" };

  // Pre-flight: which Products on this order are still purchasable?
  // A product is purchasable iff status=PUBLISHED and deletedAt is null.
  // Stock is enforced inside addItem itself (variant-level), so we only
  // pre-screen the catalogue-availability bit here.
  const productIds = Array.from(
    new Set(order.items.map((it) => it.productId)),
  );
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, status: true, deletedAt: true },
  });
  const availableProductIds = new Set(
    products
      .filter(
        (p) =>
          p.deletedAt === null && p.status === ProductStatus.PUBLISHED,
      )
      .map((p) => p.id),
  );

  const skippedList: Array<{
    name: string;
    reason: "unavailable" | "out-of-stock";
  }> = [];
  let added = 0;

  const prismaLocale =
    URL_LOCALE_TO_PRISMA[locale as keyof typeof URL_LOCALE_TO_PRISMA] ?? "EN";

  // Sequential to keep cart writes serialised (the cart helper isn't
  // designed for parallel addItem calls on the same cart).
  for (const line of order.items) {
    const fallbackName = line.nameSnapshot;

    if (!availableProductIds.has(line.productId)) {
      skippedList.push({ name: fallbackName, reason: "unavailable" });
      continue;
    }

    // Pull variantId from the raw order item — getMyOrderByNumber's
    // current shape doesn't expose it, so we query OrderItem directly
    // for its variantId. One small extra round-trip per line in
    // exchange for not touching the larger query helper.
    const fullItem = await prisma.orderItem.findUnique({
      where: { id: line.id },
      select: { variantId: true },
    });
    const orderItemVariantId = fullItem?.variantId ?? null;

    try {
      await addItem({
        productId: line.productId,
        variantId: orderItemVariantId,
        quantity: line.quantity,
        locale: prismaLocale as never,
      });
      added += 1;
    } catch (err) {
      // addItem throws on stock shortfalls — bucket as out-of-stock.
      const message = err instanceof Error ? err.message : "";
      const reason: "out-of-stock" | "unavailable" =
        /stock|qty|quantity|sold|out/i.test(message)
          ? "out-of-stock"
          : "unavailable";
      skippedList.push({ name: fallbackName, reason });
    }
  }

  // Refresh the layout so the cart badge updates everywhere.
  revalidatePath("/", "layout");

  return { ok: true, added, skipped: skippedList };
}
