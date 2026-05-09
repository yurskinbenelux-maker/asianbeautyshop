// ─────────────────────────────────────────────────────────────────────────
// Email preview fixtures — sample data used ONLY by the /admin/emails
// preview surface. Lets an admin QA every template offline (no need to place
// a real order just to see what the "Order shipped" email looks like).
//
// We deliberately avoid querying the DB: fixtures are frozen sample data
// so the preview looks the same every time, regardless of environment.
// Real sends to the customer always go through the proper builders with
// real order data.
//
// If a builder type changes, the fixtures here must be updated too —
// TypeScript will catch that immediately.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import type { EmailOrder } from "@/lib/email/order-query";
import type { AbandonedCart } from "@/lib/queries/abandoned-carts";
import type { LowStockReport } from "@/lib/queries/low-stock";

/** A realistic-looking order fixture — 2 items, shipping address, EUR. */
export function fixtureOrder(locale: Locale): EmailOrder {
  return {
    id: "preview-order-id",
    publicNumber: "ABS-2026-000123",
    email: "preview@example.com",
    locale,
    placedAt: new Date("2026-04-18T10:15:00Z"),
    currency: "EUR",
    subtotal: 89.0,
    discountTotal: 9.0,
    shippingTotal: 4.95,
    taxTotal: 0,
    grandTotal: 84.95,
    invoiceUrl: null,
    trackingNumber: "3SCENE012345678",
    trackingUrl: "https://jouw.postnl.nl/track-and-trace/3SCENE012345678-BE-1050",
    itemCount: 3,
    items: [
      {
        id: "preview-item-1",
        quantity: 1,
        unitPrice: 38.0,
        lineTotal: 38.0,
        productName: "Rice Water Cleansing Gel",
        productSlug: "rice-water-cleansing-gel",
        imageUrl:
          "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=160&q=80",
        kind: "STANDARD",
      },
      {
        id: "preview-item-2",
        quantity: 2,
        unitPrice: 25.5,
        lineTotal: 51.0,
        productName: "Ginseng Recovery Serum",
        productSlug: "ginseng-recovery-serum",
        imageUrl:
          "https://images.unsplash.com/photo-1620916566886-f7069e6aaaa0?auto=format&fit=crop&w=160&q=80",
        kind: "STANDARD",
      },
    ],
    shippingAddress: {
      firstName: "Anna",
      lastName: "De Vries",
      line1: "Rue du Marché 14",
      line2: "Apt 3B",
      city: "Brussels",
      postcode: "1000",
      region: null,
      country: "BE",
    },
    customerFirstName: "Anna",
  };
}

/** AbandonedCart fixture — same shape the abandoned-cart cron produces. */
export function fixtureAbandonedCart(locale: Locale): AbandonedCart {
  return {
    cartId: "preview-cart-id",
    email: "preview@example.com",
    firstName: "Anna",
    locale,
    itemCount: 4,
    totalItems: 4,
    items: [
      {
        productName: "Rice Water Cleansing Gel",
        quantity: 1,
        imageUrl:
          "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=120&q=80",
      },
      {
        productName: "Ginseng Recovery Serum",
        quantity: 1,
        imageUrl:
          "https://images.unsplash.com/photo-1620916566886-f7069e6aaaa0?auto=format&fit=crop&w=120&q=80",
      },
      {
        productName: "Green Tea Toning Mist",
        quantity: 2,
        imageUrl: null,
      },
    ],
  };
}

/** LowStockReport fixture — three SKUs in varying danger. */
export function fixtureLowStockReport(): LowStockReport {
  return {
    threshold: 5,
    rows: [
      {
        variantId: "preview-variant-1",
        productId: "preview-product-1",
        sku: "YUR-RICE-150",
        variantLabel: "150 ml",
        productName: "Rice Water Cleansing Gel",
        stock: 0,
        adminUrl: "/admin/products/preview-product-1",
      },
      {
        variantId: "preview-variant-2",
        productId: "preview-product-2",
        sku: "YUR-GINSENG-30",
        variantLabel: "30 ml",
        productName: "Ginseng Recovery Serum",
        stock: 2,
        adminUrl: "/admin/products/preview-product-2",
      },
      {
        variantId: "preview-variant-3",
        productId: "preview-product-3",
        sku: "YUR-GREEN-100",
        variantLabel: "100 ml",
        productName: "Green Tea Toning Mist",
        stock: 4,
        adminUrl: "/admin/products/preview-product-3",
      },
    ],
  };
}
