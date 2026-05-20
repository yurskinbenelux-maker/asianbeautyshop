// ─────────────────────────────────────────────────────────────────────────
// Invoice → Billit request mapper.
//
// Loads an Invoice row + its parent Order + items + EN product translations
// + billing address, and assembles a BillitOrderRequest ready to POST. The
// mapping respects three rules from issue.ts + pricing.ts:
//
//   1. Gross-leading line totals (InclLeading=true + TotalIncl). Our
//      customer PDF shows gross prices per line; preserving the gross
//      amount as the source of truth keeps the two documents in exact
//      arithmetic agreement.
//   2. Gift cards (OrderItem.giftCardConfig != null) ship at VATPercentage
//      0 + VentilationCode "22" (Buiten BTW / Out of scope). This is the
//      Belgian MPV treatment per EU Dir 2016/1065 — VAT only at redemption.
//   3. Coupon discount renders as a negative line at the matching VAT
//      rate of the discounted items. Belgian KB nr 1 art. 5 requires the
//      discount visible AND VAT computed on the discounted base; this
//      shape satisfies both because Billit's per-rate aggregation reduces
//      the taxable base by the negative line's amount.
//
// Product names are forced to English regardless of customer locale — same
// rule issue.ts applies for the customer PDF, kept consistent in Billit so
// the accountant doesn't get Cyrillic line items.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  BillitCustomer,
  BillitOrderLine,
  BillitOrderRequest,
} from "./types";

export type InvoiceMapResult = {
  request: BillitOrderRequest;
  /** Convenience pull-throughs for the reconciliation check. */
  ourGrandTotal: number;
  ourVatTotal: number;
};

/**
 * Build a BillitOrderRequest for the given Invoice. Throws if the row or
 * its linked order can't be found.
 *
 * Note: this function does NOT attach the PDF — that's the push layer's
 * job, because the PDF download is an I/O step we'd rather isolate.
 */
export async function mapInvoiceToBillitRequest(
  invoiceId: string,
): Promise<InvoiceMapResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      order: {
        include: {
          items: true,
          billingAddress: true,
          shippingAddress: true,
          user: true,
        },
      },
    },
  });
  if (!invoice) {
    throw new Error(`billit/map-invoice: Invoice ${invoiceId} not found`);
  }
  const order = invoice.order;

  // ────────── English product names (single fetch for the whole order) ──
  // Same pattern issue.ts uses. We look up EN translations once and key
  // them by productId; missing translations fall back to the cart snapshot
  // captured at place-order time.
  const productIds = order.items.map((it) => it.productId);
  const enTranslations = await prisma.productTranslation.findMany({
    where: { productId: { in: productIds }, locale: "EN" },
    select: { productId: true, name: true },
  });
  const enNameByProductId = new Map(
    enTranslations.map((t) => [t.productId, t.name]),
  );

  // ────────── Lines: products + gift cards ──────────────────────────────
  const productLines: BillitOrderLine[] = order.items.map((it) => {
    const lineTotal = Number(it.lineTotal);
    const isVoucher = it.giftCardConfig != null;
    const vatPercentage = isVoucher
      ? 0
      : Math.round(Number(it.taxRate ?? 0.21) * 100);
    const name = enNameByProductId.get(it.productId) ?? it.nameSnapshot;

    const line: BillitOrderLine = {
      Quantity: it.quantity,
      Description: name,
      Reference: it.id, // OrderItem.id for traceability
      VATPercentage: vatPercentage,
      InclLeading: true,
      TotalIncl: round2(lineTotal),
    };
    if (isVoucher) {
      // Code 22 → UBL TaxCategory O ("Services outside scope of tax").
      // Without this, a 0% line defaults to category Z which would land
      // the voucher in the wrong BTW box on the periodic return.
      line.VentilationCode = "22";
    }
    return line;
  });

  // ────────── Shipping line ─────────────────────────────────────────────
  // BE-domestic shipping is treated as an ancillary supply at the same
  // VAT rate as the goods (21% standard). We always render shipping as a
  // separate Billit line so the accountant can see what's product vs.
  // freight in the books.
  const shippingTotal = Number(order.shippingTotal);
  const shippingLine: BillitOrderLine | null =
    shippingTotal > 0
      ? {
          Quantity: 1,
          Description: "Shipping",
          VATPercentage: 21,
          InclLeading: true,
          TotalIncl: round2(shippingTotal),
        }
      : null;

  // ────────── Discount line (negative, matching VAT rate) ──────────────
  // Today every discountable item in ABS is at 21% (gift cards are
  // excluded from coupons in pricing.ts). So we attribute the whole
  // discount to 21%. If we ever introduce a mixed-rate cart, this branch
  // needs to apportion the discount across rates proportionally — leave
  // a TODO so the next visitor knows where to look.
  const discountTotal = Number(order.discountTotal ?? 0);
  const discountLine: BillitOrderLine | null =
    discountTotal > 0
      ? {
          Quantity: 1,
          Description: order.couponCode ?? "Discount",
          VATPercentage: 21, // TODO: apportion across rates when 6% products land
          InclLeading: true,
          TotalIncl: -round2(discountTotal),
        }
      : null;

  const lines: BillitOrderLine[] = [
    ...productLines,
    ...(shippingLine ? [shippingLine] : []),
    ...(discountLine ? [discountLine] : []),
  ];

  // ────────── Customer ─────────────────────────────────────────────────
  const billingAddress = order.billingAddress ?? order.shippingAddress;
  if (!billingAddress) {
    throw new Error(
      `billit/map-invoice: order ${order.id} has no billing or shipping address`,
    );
  }
  const personName = [billingAddress.firstName, billingAddress.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  // Company on the address → B2B-style Name = company, contact = person.
  // No company → Private Person, Name = person.
  const customerName = billingAddress.company || personName || "Customer";
  const customer: BillitCustomer = {
    Name: customerName,
    PartyType: "Customer",
    Email: order.email ?? undefined,
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

  // ────────── Assemble the request ──────────────────────────────────────
  // OrderDate = invoice issue date (frozen on Invoice.issuedAt). ExpiryDate
  // = same — these orders are paid at checkout, so "due" already happened.
  const issueDateIso = invoice.issuedAt.toISOString().slice(0, 10);
  const request: BillitOrderRequest = {
    OrderType: "Invoice",
    OrderDirection: "Income",
    OrderNumber: invoice.number,
    OrderDate: issueDateIso,
    ExpiryDate: issueDateIso,
    Currency: "EUR",
    Customer: customer,
    OrderLines: lines,
    // Comments goes in the invoice footer in Billit's UI. We stash the
    // Mollie payment ref here so the accountant can reconcile against the
    // bank statement without flipping back to our system.
    Comments: order.mollieId
      ? `Payment ref (Mollie): ${order.mollieId}`
      : undefined,
  };

  return {
    request,
    ourGrandTotal: Number(invoice.grandTotal),
    ourVatTotal: Number(invoice.vatTotal),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
