// ─────────────────────────────────────────────────────────────────────────
// OrderStatusPill — small coloured badge that reflects OrderStatus.
//
// Colour keys (ink-palette only — no new colours introduced):
//   · PENDING / FULFILLING       → gold    (warm waiting)
//   · PAID / SHIPPED             → celadon (in-flight, good)
//   · DELIVERED                  → ink     (solid, done)
//   · CANCELLED / REFUNDED / …   → vermilion (attention)
//
// The component is purely presentational; the label comes from the caller
// so it respects whatever locale the page is rendered in.
// ─────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils";

export type OrderStatusKey =
  | "PENDING"
  | "PAID"
  | "FULFILLING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

const STATUS_CLASSES: Record<OrderStatusKey, string> = {
  PENDING: "bg-gold/10 text-gold border-gold/30",
  FULFILLING: "bg-gold/10 text-gold border-gold/30",
  PAID: "bg-celadon/15 text-celadon border-celadon/40",
  SHIPPED: "bg-celadon/15 text-celadon border-celadon/40",
  DELIVERED: "bg-ink/5 text-ink border-ink/20",
  CANCELLED: "bg-vermilion/10 text-vermilion border-vermilion/30",
  REFUNDED: "bg-vermilion/10 text-vermilion border-vermilion/30",
  PARTIALLY_REFUNDED: "bg-vermilion/10 text-vermilion border-vermilion/30",
};

export function OrderStatusPill({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  // Fallback colour if the status somehow isn't in the map — keeps the UI
  // readable even if we add a new OrderStatus enum value without updating
  // this file.
  const classes =
    STATUS_CLASSES[status as OrderStatusKey] ??
    "bg-ink/5 text-ink-mid border-ink/20";

  return (
    <span
      className={cn(
        "inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-label",
        classes,
      )}
    >
      {label}
    </span>
  );
}
