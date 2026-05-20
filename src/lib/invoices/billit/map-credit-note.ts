// ─────────────────────────────────────────────────────────────────────────
// CreditNote → Billit request mapper.
//
// Mirror of map-invoice.ts but for OrderType: "CreditNote". Billit's
// /v1/orders endpoint handles both via the discriminator — the only
// substantive differences are:
//
//   · OrderType: "CreditNote" instead of "Invoice"
//   · Reference to the parent invoice number (so Billit's UI can link
//     the credit note back to its origin)
//   · Lines are POSITIVE amounts (the OrderType tells the accounting
//     system to treat them as reversing — we don't double-negate)
//   · The reason (RETURN / CANCELLATION / GOODWILL / etc.) lands in the
//     Comments footer so the accountant has context without opening
//     our admin
//
// Gift card refund handling: a return that involves a gift-card line
// produces a CreditNoteItem with vatRate=0. We mark any 0% CN line with
// VentilationCode "22" so it lands in the same out-of-scope BTW box as
// the original sale. This keeps the BTW return self-balancing — sale
// goes IN to box X, refund goes OUT of box X.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  BillitCustomer,
  BillitOrderLine,
  BillitOrderRequest,
} from "./types";

export type CreditNoteMapResult = {
  request: BillitOrderRequest;
  /** True if the CN's PDF hasn't been rendered yet — caller should skip the push. */
  pdfMissing: boolean;
  ourGrandTotal: number;
  ourVatTotal: number;
};

export async function mapCreditNoteToBillitRequest(
  creditNoteId: string,
): Promise<CreditNoteMapResult> {
  const cn = await prisma.creditNote.findUnique({
    where: { id: creditNoteId },
    include: {
      items: true,
      invoice: { select: { number: true } },
      order: {
        include: {
          billingAddress: true,
          shippingAddress: true,
        },
      },
    },
  });
  if (!cn) {
    throw new Error(`billit/map-credit-note: CN ${creditNoteId} not found`);
  }

  // ────────── Lines ─────────────────────────────────────────────────────
  // One Billit line per CreditNoteItem, all positive. The 0% lines pick
  // up VentilationCode "22" so MPV gift card refunds land in the right
  // BTW return box.
  const itemLines: BillitOrderLine[] = cn.items.map((it) => {
    const vatPercentage = Math.round(Number(it.vatRate) * 100);
    const line: BillitOrderLine = {
      Quantity: it.quantity,
      Description: it.nameSnapshot,
      Reference: it.id,
      VATPercentage: vatPercentage,
      InclLeading: true,
      TotalIncl: round2(Number(it.lineTotalInclVat)),
    };
    if (vatPercentage === 0) {
      // Same rule as the original sale — preserves out-of-scope BTW
      // classification on the refund side.
      line.VentilationCode = "22";
    }
    return line;
  });

  // Shipping refund (if the admin chose to credit shipping). Same VAT
  // rule as on the sale side — BE 21% ancillary supply.
  const shippingTotal = Number(cn.shippingTotal);
  const shippingLine: BillitOrderLine | null =
    shippingTotal > 0
      ? {
          Quantity: 1,
          Description: "Shipping refund",
          VATPercentage: 21,
          InclLeading: true,
          TotalIncl: round2(shippingTotal),
        }
      : null;

  const lines: BillitOrderLine[] = [
    ...itemLines,
    ...(shippingLine ? [shippingLine] : []),
  ];

  // ────────── Customer ─────────────────────────────────────────────────
  // Read from the originating Order's billing address (frozen-enough for
  // our purposes — addresses rarely change, and Billit's dedupe matches
  // by name + zipcode + country, so a minor change wouldn't fork the
  // customer record).
  const billingAddress = cn.order.billingAddress ?? cn.order.shippingAddress;
  if (!billingAddress) {
    throw new Error(
      `billit/map-credit-note: order ${cn.orderId} has no addresses`,
    );
  }
  const personName = [billingAddress.firstName, billingAddress.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const customerName = billingAddress.company || personName || "Customer";
  const customer: BillitCustomer = {
    Name: customerName,
    PartyType: "Customer",
    Email: cn.order.email ?? undefined,
    Addresses: [
      {
        AddressType: "InvoiceAddress",
        Name: customerName,
        Street: [billingAddress.line1, billingAddress.line2]
          .filter(Boolean)
          .join(" "),
        Zipcode: billingAddress.postcode,
        City: billingAddress.city,
        CountryCode: billingAddress.country.toUpperCase(),
      },
    ],
  };

  // ────────── Assemble ─────────────────────────────────────────────────
  // The parent invoice reference goes via LinkedOrderNumber (best guess
  // at Billit's field name based on their docs index — the
  // /docs/custom-fields-credit-note page is the canonical reference).
  // We ALSO stash the invoice number in Comments as a belt-and-braces
  // measure: if LinkedOrderNumber turns out to be wrong or unsupported,
  // the link is still visible to the accountant in the footer.
  const issueDateIso = cn.issuedAt.toISOString().slice(0, 10);
  const parentInvoiceNumber = cn.invoice.number;
  const reasonLabel = formatReason(cn.reason, cn.reasonNote);
  const request: BillitOrderRequest = {
    OrderType: "CreditNote",
    OrderDirection: "Income",
    OrderNumber: cn.number,
    OrderDate: issueDateIso,
    Currency: "EUR",
    Customer: customer,
    OrderLines: lines,
    LinkedOrderNumber: parentInvoiceNumber,
    Comments: [
      `Credit note against invoice ${parentInvoiceNumber}`,
      reasonLabel,
    ]
      .filter(Boolean)
      .join(" — "),
  };

  return {
    request,
    pdfMissing: cn.pdfPath == null,
    ourGrandTotal: Number(cn.grandTotal),
    ourVatTotal: Number(cn.vatTotal),
  };
}

function formatReason(
  reason: string,
  note: string | null,
): string {
  // Mirrors the enum values in prisma/schema.prisma. Kept inline rather
  // than importing the Prisma enum so this file doesn't pull a runtime
  // dependency on the generated client.
  const labels: Record<string, string> = {
    RETURN: "Customer return",
    CANCELLATION: "Order cancellation",
    PRICE_ADJUSTMENT: "Price adjustment",
    GOODWILL: "Goodwill credit",
    DUPLICATE: "Duplicate invoice correction",
  };
  const base = labels[reason] ?? reason;
  return note ? `${base}: ${note}` : base;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
