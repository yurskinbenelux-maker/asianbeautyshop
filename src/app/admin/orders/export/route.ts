// ─────────────────────────────────────────────────────────────────────────
// /admin/orders/export — CSV download of the filtered order list.
//
// Reuses the same filter semantics as the list page so "what you see is
// what you export".  We cap the export at 10,000 rows per request; if
// Sofia ever needs more than that, she can narrow the date range.
//
// Two formats:
//   ?format=summary   (default) one row per order — for quick inventory
//                      reviews and customer-level reporting
//   ?format=items               one row per OrderItem — the shape Sofia's
//                      accountant wants for VAT filings (per-line tax rate
//                      + tax amount + SKU).
//
// Format: RFC 4180-ish CSV with CRLF line endings and standard quoting,
// UTF-8 with a BOM so Excel on Windows auto-detects encoding without
// mangling accented customer names.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const MAX_ROWS = 10_000;

type ExportFormat = "summary" | "items";

export async function GET(req: NextRequest) {
  await requireAdmin();

  const { searchParams } = new URL(req.url);

  const format: ExportFormat =
    searchParams.get("format") === "items" ? "items" : "summary";

  const q = searchParams.get("q") ?? undefined;
  const statusRaw = searchParams.get("status") ?? undefined;
  const paymentRaw = searchParams.get("paymentStatus") ?? undefined;
  const fromRaw = searchParams.get("from") ?? undefined;
  const toRaw = searchParams.get("to") ?? undefined;

  const status = isOrderStatus(statusRaw) ? statusRaw : undefined;
  const paymentStatus = isPaymentStatus(paymentRaw) ? paymentRaw : undefined;
  const from = parseDate(fromRaw);
  const to = parseDate(toRaw);
  const toInclusive =
    to !== undefined
      ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)
      : undefined;

  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (from || toInclusive) {
    where.placedAt = {};
    if (from) where.placedAt.gte = from;
    if (toInclusive) where.placedAt.lte = toInclusive;
  }
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { publicNumber: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { mollieId: { contains: term, mode: "insensitive" } },
      {
        user: {
          OR: [
            { firstName: { contains: term, mode: "insensitive" } },
            { lastName: { contains: term, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  // ── Dispatch to the right builder based on format ──────────────────────
  const body =
    format === "items"
      ? await buildItemsCsv(where)
      : await buildSummaryCsv(where);

  const filename = `orders-${format}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ──────── summary: one row per order ────────────────────────────────────

async function buildSummaryCsv(where: Prisma.OrderWhereInput): Promise<string> {
  const rows = await prisma.order.findMany({
    where,
    orderBy: { placedAt: "desc" },
    take: MAX_ROWS,
    select: {
      publicNumber: true,
      placedAt: true,
      paidAt: true,
      shippedAt: true,
      email: true,
      status: true,
      paymentStatus: true,
      subtotal: true,
      discountTotal: true,
      shippingTotal: true,
      taxTotal: true,
      grandTotal: true,
      currency: true,
      couponCode: true,
      mollieId: true,
      trackingNumber: true,
      userId: true,
      user: { select: { firstName: true, lastName: true } },
      shippingAddress: {
        select: {
          line1: true,
          line2: true,
          postcode: true,
          city: true,
          country: true,
        },
      },
      items: { select: { quantity: true } },
    },
  });

  const header = [
    "Order",
    "Placed",
    "Paid",
    "Shipped",
    "Status",
    "Payment",
    "Email",
    "Customer",
    "Guest",
    "Items",
    "Subtotal",
    "Discount",
    "Shipping",
    "Tax",
    "Grand total",
    "Currency",
    "Coupon",
    "Mollie id",
    "Tracking",
    "Ship to line1",
    "Ship to line2",
    "Postcode",
    "City",
    "Country",
  ];

  const lines: string[] = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const fullName = r.user
      ? [r.user.firstName, r.user.lastName].filter(Boolean).join(" ").trim()
      : "";
    const itemCount = r.items.reduce((n, i) => n + i.quantity, 0);
    lines.push(
      [
        r.publicNumber,
        iso(r.placedAt),
        iso(r.paidAt),
        iso(r.shippedAt),
        r.status,
        r.paymentStatus,
        r.email,
        fullName,
        r.userId === null ? "yes" : "no",
        String(itemCount),
        money(r.subtotal),
        money(r.discountTotal),
        money(r.shippingTotal),
        money(r.taxTotal),
        money(r.grandTotal),
        r.currency,
        r.couponCode ?? "",
        r.mollieId ?? "",
        r.trackingNumber ?? "",
        r.shippingAddress?.line1 ?? "",
        r.shippingAddress?.line2 ?? "",
        r.shippingAddress?.postcode ?? "",
        r.shippingAddress?.city ?? "",
        r.shippingAddress?.country ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // UTF-8 BOM prefix — critical for Excel on Windows, harmless elsewhere.
  return "\ufeff" + lines.join("\r\n");
}

// ──────── items: one row per OrderItem (accounting view) ────────────────

async function buildItemsCsv(where: Prisma.OrderWhereInput): Promise<string> {
  // We paginate by orders (easier to cap) rather than items. With the
  // MAX_ROWS cap on orders and a realistic ~10 items per order, we stay
  // well within memory/download limits.
  const orders = await prisma.order.findMany({
    where,
    orderBy: { placedAt: "desc" },
    take: MAX_ROWS,
    select: {
      publicNumber: true,
      placedAt: true,
      paidAt: true,
      email: true,
      status: true,
      paymentStatus: true,
      currency: true,
      mollieId: true,
      user: { select: { firstName: true, lastName: true } },
      billingAddress: {
        select: {
          line1: true,
          postcode: true,
          city: true,
          country: true,
        },
      },
      items: {
        orderBy: { id: "asc" },
        select: {
          nameSnapshot: true,
          skuSnapshot: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          taxRate: true,
        },
      },
    },
  });

  const header = [
    "Order",
    "Placed",
    "Paid",
    "Status",
    "Payment",
    "Email",
    "Customer",
    "SKU",
    "Product",
    "Qty",
    "Unit price",
    "Line total",
    "Tax rate",
    "Tax amount",
    "Line ex. tax",
    "Currency",
    "Mollie id",
    "Bill to line1",
    "Bill to postcode",
    "Bill to city",
    "Bill to country",
  ];

  const lines: string[] = [header.map(csvCell).join(",")];

  for (const o of orders) {
    const fullName = o.user
      ? [o.user.firstName, o.user.lastName].filter(Boolean).join(" ").trim()
      : "";

    for (const it of o.items) {
      // Tax rate is a fraction (0.2100 for 21%). Compute the tax amount
      // and ex-tax line for the accountant from the line total.
      // Logic: lineTotal is the VAT-inclusive total at the rate recorded
      // on the row. Ex-tax = lineTotal / (1 + rate); tax = diff.
      const rate = it.taxRate !== null && it.taxRate !== undefined ? Number(it.taxRate) : null;
      const lineTotalNum = Number(it.lineTotal);
      const exTax =
        rate !== null && rate > 0
          ? lineTotalNum / (1 + rate)
          : lineTotalNum;
      const taxAmount = rate !== null && rate > 0 ? lineTotalNum - exTax : 0;

      lines.push(
        [
          o.publicNumber,
          iso(o.placedAt),
          iso(o.paidAt),
          o.status,
          o.paymentStatus,
          o.email,
          fullName,
          it.skuSnapshot,
          it.nameSnapshot,
          String(it.quantity),
          money(it.unitPrice),
          money(it.lineTotal),
          rate === null ? "" : (rate * 100).toFixed(2) + "%",
          rate === null ? "" : taxAmount.toFixed(2),
          rate === null ? money(it.lineTotal) : exTax.toFixed(2),
          o.currency,
          o.mollieId ?? "",
          o.billingAddress?.line1 ?? "",
          o.billingAddress?.postcode ?? "",
          o.billingAddress?.city ?? "",
          o.billingAddress?.country ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  return "\ufeff" + lines.join("\r\n");
}

// ──────── helpers ──────────────────────────────────────────────────────

function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === "string" && (Object.values(OrderStatus) as string[]).includes(v);
}
function isPaymentStatus(v: unknown): v is PaymentStatus {
  return typeof v === "string" && (Object.values(PaymentStatus) as string[]).includes(v);
}
function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function iso(d: Date | null | undefined) {
  if (!d) return "";
  return d.toISOString();
}
function money(v: Prisma.Decimal | null | undefined) {
  if (v === null || v === undefined) return "";
  return Number(v).toFixed(2);
}

/** RFC-4180 style cell escaping. */
function csvCell(v: string): string {
  const needsQuoting = /[",\r\n]/.test(v);
  const doubled = v.replace(/"/g, '""');
  return needsQuoting ? `"${doubled}"` : doubled;
}
