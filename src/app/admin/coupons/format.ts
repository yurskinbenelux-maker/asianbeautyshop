// ─────────────────────────────────────────────────────────────────────────
// Tiny shared formatters for the coupons pages. Separated from the queries
// file so they can be used by server components without pulling Prisma in.
// ─────────────────────────────────────────────────────────────────────────

const EUR = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const DATE = new Intl.DateTimeFormat("en-IE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDiscount(c: {
  kind: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number;
}): string {
  if (c.kind === "PERCENT") return `${c.value}% off`;
  if (c.kind === "FIXED") return `${EUR.format(c.value / 100)} off`;
  return "Free shipping";
}

export function formatMinSubtotal(cents: number | null): string {
  if (!cents) return "—";
  return `from ${EUR.format(cents / 100)}`;
}

export function formatWindow(
  startsAt: Date | null,
  endsAt: Date | null,
): string {
  if (!startsAt && !endsAt) return "Always";
  if (startsAt && endsAt) {
    return `${DATE.format(startsAt)} – ${DATE.format(endsAt)}`;
  }
  if (startsAt) return `from ${DATE.format(startsAt)}`;
  return `until ${DATE.format(endsAt!)}`;
}
