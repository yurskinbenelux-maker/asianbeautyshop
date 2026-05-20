// ─────────────────────────────────────────────────────────────────────────
// Billit API types.
//
// Subset of Billit's POST /v1/orders + GET /v1/orders/{id} shapes — just
// the fields we actually use for K'Elmus' BE-VAT sales invoices + credit
// notes. Full schema lives at https://docs.billit.be/reference.
//
// Conventions worth knowing:
//   · OrderType "Invoice" or "CreditNote" — both go through /v1/orders.
//   · OrderDirection "Income" = we're selling (vs. "Outgoing" = receiving
//     supplier invoices, not our case).
//   · OrderNumber is OUR sequence — Billit accepts it verbatim. We pass
//     INV-2026-NNNNN and CN-2026-NNNN here so the customer's PDF and the
//     accountant's books carry the same number.
//   · Money values are JSON numbers (NOT strings). Two-decimal EUR.
//   · VATPercentage is also a number (0, 6, 12, 21).
//   · InclLeading=true tells Billit "line totals govern, derive excl/VAT
//     from them" — this is the only way to guarantee our gross-per-line
//     numbers survive Billit's recalc.
//   · VentilationCode is needed when VATPercentage=0 AND the line needs
//     a specific BTW classification. Code 22 = "out of scope" (MPV gift
//     cards). Without a code, 0% defaults to UBL category Z which is
//     wrong for vouchers.
//   · Customer can be embedded inline; Billit dedupes on VATNumber/email.
//     We don't need to call Companies endpoints first.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Ventilation codes we actually use. Full list at:
 * https://docs.billit.be/docs/ventilation-codes
 *
 * For lines with VATPercentage > 0 we leave this undefined — Billit picks
 * the right UBL category automatically.
 */
export type BillitVentilationCode =
  | "1" // 0% (for BE) — TaxCategory Z. Not what we want for vouchers.
  | "22" // Div. Buiten BTW (Misc. Excluding VAT) — TaxCategory O. ← MPV gift cards
  | "51" // IC Goederen — TaxCategory K. Reserved for future B2B intra-EU sales.
  | "104"; // OSS — TaxCategory E. Reserved for future OSS €10k cross-border.

/**
 * One order line we send to Billit. Two valid shapes:
 *   1) UnitPriceExcl + Quantity + VATPercentage  (excl-leading, classic)
 *   2) InclLeading=true + TotalIncl + VATPercentage  (gross-leading)
 *
 * We use shape #2 for everything — our customer PDF shows gross prices,
 * so preserving the gross-per-line is what keeps the two documents in
 * exact agreement. See docs/calculations + docs/when-you-submit-prices-incl-vat.
 */
export type BillitOrderLine = {
  Quantity: number;
  Description: string;
  /** Stable ref string — we set this to our OrderItem.id for traceability. */
  Reference?: string;
  VATPercentage: number;
  /** Required when InclLeading=true. */
  InclLeading?: true;
  /** Total INCL VAT for the whole line (Quantity × UnitPriceIncl). */
  TotalIncl?: number;
  /** Only set on 0% lines that need a specific BTW classification. */
  VentilationCode?: BillitVentilationCode;
};

/**
 * Embedded customer payload. Billit upserts on VATNumber if provided,
 * otherwise on Name+Address. For B2C ABS orders we usually have no VAT
 * number — Billit creates a "Private Person" customer record per email.
 */
export type BillitCustomer = {
  Name: string;
  /** B2B only — leave undefined for private buyers. */
  VATNumber?: string;
  PartyType: "Customer";
  Addresses: Array<{
    AddressType: "InvoiceAddress" | "DeliveryAddress";
    Name: string;
    Street: string;
    /** Optional. Some Billit examples include street number in Street; we'll be safe and pass both. */
    StreetNumber?: string;
    Box?: string;
    Zipcode: string;
    City: string;
    /** ISO 3166-1 alpha-2 — "BE", "NL", "FR", etc. */
    CountryCode: string;
    /** UI language for Billit-generated emails. We always pass our own PDF so this is informational only. */
    Language?: "EN" | "NL" | "FR" | "RU";
  }>;
  /** Recipient email — Billit may use it for Peppol fallback / receipts. */
  Email?: string;
};

/**
 * Attached PDF — base64-encoded content. When present, Billit hides its
 * own generated PDF and serves ours as the human-readable document.
 */
export type BillitOrderPdf = {
  FileName: string;
  /** Base64 (no data: prefix). */
  FileContent: string;
};

/**
 * Sales invoice OR credit note. Same endpoint, OrderType discriminates.
 *
 * For a credit note, Billit links it back to the parent invoice via the
 * `LinkedOrderNumber` field (some examples in the docs use OrderNumber of
 * the parent — we'll confirm the exact field name when we implement step 3).
 */
export type BillitOrderRequest = {
  OrderType: "Invoice" | "CreditNote";
  OrderDirection: "Income";
  /** OUR sequential number (INV-2026-NNNNN or CN-2026-NNNN). */
  OrderNumber: string;
  /** ISO date — when we issued the invoice. */
  OrderDate: string;
  /** ISO date — payment due date. For paid-at-checkout we set = OrderDate. */
  ExpiryDate?: string;
  Currency: "EUR";
  Customer: BillitCustomer;
  OrderLines: BillitOrderLine[];
  /** Replaces Billit's PDF — accountant sees the same file the customer saw. */
  OrderPDF?: BillitOrderPdf;
  /** Optional free text on the invoice footer — we store the Mollie payment ref here for reconciliation. */
  Comments?: string;
  /**
   * Header-level ventilation code applied to every 0% line that has no
   * line-level override. We don't use this — we prefer line-level because
   * a single invoice may mix MPV gift cards (code 22) with regular 21%.
   */
  VentilationCode?: BillitVentilationCode;
  /** Set when this is a credit note — references the parent invoice number. */
  LinkedOrderNumber?: string;
};

/**
 * Subset of Billit's POST /v1/orders response that we care about. Billit
 * returns the full echoed order plus their internal IDs. We store the
 * whole thing as JSON in Invoice.billitSnapshot — these typed fields are
 * just for the reconciliation check.
 */
export type BillitOrderResponse = {
  /** Billit's own UUID for the invoice. We store this in Invoice.billitInvoiceId. */
  OrderID: string;
  OrderNumber: string;
  OrderType: string;
  /** Echoed back; useful for diff. */
  TotalExcl: number;
  TotalVAT: number;
  TotalIncl: number;
  /** Per-rate VAT breakdown. */
  TaxLines?: Array<{
    VATPercentage: number;
    TaxableAmount: number;
    TaxAmount: number;
  }>;
};
