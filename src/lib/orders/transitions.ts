// ─────────────────────────────────────────────────────────────────────────
// Pure, synchronous helpers for order-status transitions.
//
// Lives here (not in actions.ts) because Next.js forbids non-async exports
// from a "use server" file. These helpers are used both server-side (inside
// actions) and during SSR of the order detail page to decide which buttons
// to render — hence a shared module.
// ─────────────────────────────────────────────────────────────────────────

import type { OrderStatus } from "@prisma/client";

/**
 * Which status transitions we permit from each starting state.
 * The UI mirrors this — buttons we wouldn't accept are simply hidden.
 * Keeps the order lifecycle sane (no jumping backwards from DELIVERED
 * to PENDING for example).
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["FULFILLING", "SHIPPED", "CANCELLED", "REFUNDED"],
  FULFILLING: ["SHIPPED", "CANCELLED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "REFUNDED", "PARTIALLY_REFUNDED"],
  DELIVERED: ["REFUNDED", "PARTIALLY_REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ["REFUNDED"],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}
