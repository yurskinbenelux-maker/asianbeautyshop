// ─────────────────────────────────────────────────────────────────────────
// Return / RMA types — local mirror of the Prisma enums + row shapes.
//
// Why local copies instead of `import type { ReturnRequest } from "@prisma/client"`?
//
// The Prisma generated client in this repo is refreshed by `prisma generate`,
// which the CI/build step runs.  During the period between the schema edit
// and the first migrate+generate, TypeScript can't see the new types.
//
// These mirrors are cheap to maintain (the fields hardly ever change) and
// let the rest of the codebase be fully type-safe even before the Prisma
// client is regenerated.  Once Max runs `prisma migrate dev`, feel free to
// re-point imports to `@prisma/client`.
// ─────────────────────────────────────────────────────────────────────────

export const RETURN_STATUS = [
  "REQUESTED",
  "APPROVED",
  "RECEIVED",
  "REFUNDED",
  "REJECTED",
  "CANCELLED",
] as const;
export type ReturnStatus = (typeof RETURN_STATUS)[number];

export const RETURN_REASON = [
  "CHANGED_MIND",
  "WRONG_ITEM",
  "DAMAGED",
  "DEFECTIVE",
  "ARRIVED_LATE",
  "ALLERGIC_REACTION",
  "OTHER",
] as const;
export type ReturnReason = (typeof RETURN_REASON)[number];

/**
 * Row shape returned by returns/db.ts — what the UI consumes.
 */
export type ReturnItemRow = {
  id: string;
  orderItemId: string;
  nameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ReturnRow = {
  id: string;
  publicNumber: string;
  orderId: string;
  orderPublicNumber: string;
  orderEmail: string;
  userId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  status: ReturnStatus;
  reason: ReturnReason;
  details: string | null;
  adminNotes: string | null;
  refundAmount: number | null;
  refundedAt: Date | null;
  /** Mollie refund id (re_xxxx) — set once A1's issueRefundAndCreditNote
   *  fires payments_refunds.create and the gateway accepts. Acts as the
   *  idempotency gate so a re-clicked "Mark received" button never
   *  produces a double refund. */
  mollieRefundId: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  /** Prepaid return-label PDF URL (Sendcloud-hosted). Null when the
   *  customer ships at their own cost — free-plan fallback or admin
   *  opted out of auto-label. */
  returnLabelUrl: string | null;
  /** Sendcloud parcel id for the return — idempotency gate against
   *  re-clicked Approve buttons. */
  sendcloudReturnParcelId: string | null;
  receivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: ReturnItemRow[];
};

/**
 * Transitions allowed from each status.  The admin UI uses this to decide
 * which status buttons to render; the server re-validates before writing.
 */
export const ALLOWED_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["RECEIVED", "CANCELLED"],
  RECEIVED: ["REFUNDED", "REJECTED"],
  REFUNDED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransition(from: ReturnStatus, to: ReturnStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
