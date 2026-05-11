// ─────────────────────────────────────────────────────────────────────────
// H2-removed: RefundForm no longer renders anywhere — the order-page
// refund path was a broken duplicate of the canonical return-page
// refund (it skipped Mollie, the credit note, the loyalty clawback,
// and the VAT YTD subtraction; customer got a refunded email but no
// money moved).
//
// All refunds now flow through /admin/returns/[id] on the RECEIVED
// transition (issueRefundAndCreditNote → Mollie + credit note + loyalty
// clawback + VAT subtraction).
//
// File kept as an empty stub so any stale import in another tree still
// resolves. Safe to delete after a release.
// ─────────────────────────────────────────────────────────────────────────

export {};
