// ─────────────────────────────────────────────────────────────────────────
// Human-readable labels for order + payment status.
//
// Lives here (not in a page file) because Next.js 15 doesn't allow
// arbitrary named exports from app/**/page.tsx — only the default export
// plus the `metadata`, `dynamic`, etc. reserved keys.
// ─────────────────────────────────────────────────────────────────────────

import type { OrderStatus, PaymentStatus } from "@prisma/client";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FULFILLING: "Fulfilling",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Part. refunded",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  AUTHORIZED: "Authorized",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Part. refunded",
};
