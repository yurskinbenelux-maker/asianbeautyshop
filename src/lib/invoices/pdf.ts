// ─────────────────────────────────────────────────────────────────────────
// Invoice PDF renderer — A4, branded Asian Beauty Shop, server-side via pdfkit.
//
// Why pdfkit: zero-dep at runtime besides the package itself, no headless
// browser needed, runs cleanly on Hostinger Node. Output is a Buffer that
// the issue orchestrator uploads to Supabase Storage and attaches to the
// order confirmation email.
//
// Layout mirrors the visual mockup approved by Max:
//   · Top: yu·r mark, "Skin Solution" eyebrow, right-side title + INV num
//   · Vermilion hairline rule under the masthead
//   · Two-column block: Issued by · Bill to
//   · Two-column block: Issue date · Supply date / order ref
//   · Line items table (item, qty, unit ex VAT, VAT %, line total)
//   · Bottom-right totals (subtotal ex VAT, VAT, shipping, grand)
//   · Footer with payment ref, IBAN, RPM line
//
// All totals are stored on the Invoice row as Decimals — we only present
// them here. Belgian VAT requires this exact level of detail per line:
// see Royal Decree no. 1, art. 5.
//
// pdfkit uses inches internally but accepts numeric pt/mm via constants;
// we work in points (default unit). A4 = 595 x 842 pt. All vertical
// values below are tuned for that.
// ─────────────────────────────────────────────────────────────────────────

import PDFDocument from "pdfkit";

// ────────── Public types ────────────────────────────────────────────────

export type InvoiceIssuerSnapshot = {
  legalName: string;
  street: string;
  cityZip: string;
  country: string;
  vatNumber: string;
  email: string;
  iban: string;
  bic: string;
  rpm: string; // RPM/RPR Antwerp 1.031.312.116
};

export type InvoiceCustomerSnapshot = {
  name: string;
  email: string;
  street?: string | null;
  cityZip?: string | null;
  country?: string | null;
};

export type InvoiceLineItem = {
  name: string;
  sku?: string | null;
  quantity: number;
  unitPriceExclVat: number; // EUR
  vatRate: number;          // 0.21 for 21%
  lineTotalInclVat: number; // EUR
};

export type InvoicePdfInput = {
  number: string;            // "INV-2026-00042"
  issueDate: Date;
  supplyDate: Date | null;   // null for digital-only orders → render "—"
  orderPublicNumber: string; // "ABS-O-1042"
  issuer: InvoiceIssuerSnapshot;
  customer: InvoiceCustomerSnapshot;
  items: InvoiceLineItem[];
  shipping: { exclVat: number; vatRate: number; inclVat: number };
  totals: {
    subtotalExclVat: number;
    vatTotal: number;
    grandTotal: number;
  };
  paymentMethod: string | null;       // "Bancontact" / "iDEAL" / etc.
  molliePaymentReference: string | null;
};

// ────────── Brand tokens ────────────────────────────────────────────────

const COLORS = {
  ink: "#121110",
  inkMid: "#3D3935",
  inkSoft: "#6F6A65",
  inkSofter: "#8A8A8A",
  vermilion: "#C8102E",
  rule: "#E8DFD0", // hairline cream
};

// pdfkit's default fonts cover what we need: Helvetica for sans, Times for
// serif. Times-Roman maps cleanly to "Georgia-style" without bundling a
// custom font (custom fonts are pain to ship in serverless).
const FONTS = {
  serif: "Times-Roman",
  serifBold: "Times-Bold",
  sans: "Helvetica",
  sansBold: "Helvetica-Bold",
  mono: "Courier",
};

// ────────── Public API ──────────────────────────────────────────────────

/**
 * Render an A4 PDF invoice. Returns a Buffer ready for upload + email
 * attach. Pure — no side effects, no DB.
 */
export async function renderInvoicePdf(
  input: InvoicePdfInput,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
        info: {
          Title: input.number,
          Author: input.issuer.legalName,
          Subject: `Invoice ${input.number}`,
          Producer: "Asian Beauty Shop",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      drawDocument(doc, input);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ────────── Layout ──────────────────────────────────────────────────────

type Doc = InstanceType<typeof PDFDocument>;

function drawDocument(doc: Doc, input: InvoicePdfInput): void {
  // We draw inside a 36pt margin frame. Page width = 595, usable width
  // 595 - 72 = 523. All x positions below are absolute from the page
  // origin, not from the margin — keeps the math obvious when reading
  // back through the layout.
  const left = 36;
  const right = 559;
  const innerWidth = right - left;

  drawMasthead(doc, input, left, right);
  drawHairline(doc, left, right, 110, COLORS.vermilion, 0.7);

  let y = 130;
  y = drawIssuerCustomer(doc, input, left, innerWidth, y);
  y = drawDates(doc, input, left, innerWidth, y);
  y = drawLinesTable(doc, input, left, right, y);
  y = drawTotals(doc, input, left, right, y);

  drawFooter(doc, input, left, right);
}

function drawMasthead(
  doc: Doc,
  input: InvoicePdfInput,
  left: number,
  right: number,
): void {
  // Wordmark — "yu·r" in serif, brand convention.
  doc
    .font(FONTS.serif)
    .fontSize(22)
    .fillColor(COLORS.ink)
    .text("yu·r", left, 40);
  doc
    .font(FONTS.sans)
    .fontSize(8)
    .fillColor(COLORS.inkSofter)
    .text("SKIN SOLUTION", left, 68, { characterSpacing: 2 });

  // Right-side title + invoice number.
  doc
    .font(FONTS.serif)
    .fontSize(20)
    .fillColor(COLORS.ink)
    .text("Invoice", left, 42, { width: right - left, align: "right" });
  doc
    .font(FONTS.mono)
    .fontSize(11)
    .fillColor(COLORS.vermilion)
    .text(input.number, left, 70, { width: right - left, align: "right" });
}

function drawHairline(
  doc: Doc,
  left: number,
  right: number,
  y: number,
  color: string,
  opacity: number,
): void {
  doc
    .save()
    .moveTo(left, y)
    .lineTo(right, y)
    .lineWidth(0.6)
    .strokeColor(color)
    .opacity(opacity)
    .stroke()
    .restore();
}

function drawIssuerCustomer(
  doc: Doc,
  input: InvoicePdfInput,
  left: number,
  innerWidth: number,
  y: number,
): number {
  const colWidth = (innerWidth - 24) / 2;
  const rightCol = left + colWidth + 24;

  // Labels
  doc
    .font(FONTS.sans)
    .fontSize(7)
    .fillColor(COLORS.inkSofter)
    .text("ISSUED BY", left, y, { characterSpacing: 2 });
  doc.text("BILL TO", rightCol, y, { characterSpacing: 2 });

  // Issuer block
  const { issuer, customer } = input;
  doc
    .font(FONTS.sansBold)
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text(issuer.legalName, left, y + 14, { width: colWidth });
  doc
    .font(FONTS.sans)
    .fontSize(9)
    .fillColor(COLORS.inkMid);
  doc.text(issuer.street, left, doc.y, { width: colWidth });
  doc.text(issuer.cityZip, left, doc.y, { width: colWidth });
  doc.text(`VAT ${issuer.vatNumber}`, left, doc.y, { width: colWidth });
  doc.text(issuer.email, left, doc.y, { width: colWidth });
  const issuerEndY = doc.y;

  // Customer block (mirror layout right side).
  doc
    .font(FONTS.sansBold)
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text(customer.name, rightCol, y + 14, { width: colWidth });
  doc.font(FONTS.sans).fontSize(9).fillColor(COLORS.inkMid);
  if (customer.street) doc.text(customer.street, rightCol, doc.y, { width: colWidth });
  if (customer.cityZip) doc.text(customer.cityZip, rightCol, doc.y, { width: colWidth });
  if (customer.country) doc.text(customer.country, rightCol, doc.y, { width: colWidth });
  doc.text(customer.email, rightCol, doc.y, { width: colWidth });
  const customerEndY = doc.y;

  return Math.max(issuerEndY, customerEndY) + 18;
}

function drawDates(
  doc: Doc,
  input: InvoicePdfInput,
  left: number,
  innerWidth: number,
  y: number,
): number {
  const colWidth = (innerWidth - 24) / 2;
  const rightCol = left + colWidth + 24;

  doc
    .font(FONTS.sans)
    .fontSize(7)
    .fillColor(COLORS.inkSofter);
  doc.text("ISSUE DATE", left, y, { characterSpacing: 2 });
  doc.text("SUPPLY DATE · ORDER REF", rightCol, y, {
    characterSpacing: 2,
  });

  doc.font(FONTS.sans).fontSize(10).fillColor(COLORS.inkMid);
  doc.text(formatDate(input.issueDate), left, y + 12);

  const supplyText = input.supplyDate ? formatDate(input.supplyDate) : "—";
  doc.text(`${supplyText} · #${input.orderPublicNumber}`, rightCol, y + 12);

  return y + 36;
}

function drawLinesTable(
  doc: Doc,
  input: InvoicePdfInput,
  left: number,
  right: number,
  startY: number,
): number {
  // Column anchors. Right-aligned numeric columns sit on these x's.
  const colItem = left;
  const colQty = left + 250;
  const colUnit = left + 320;
  const colVat = left + 415;
  const colLine = right;

  let y = startY;

  // Header row.
  doc
    .font(FONTS.sans)
    .fontSize(7)
    .fillColor(COLORS.inkSoft);
  doc.text("ITEM", colItem, y, { characterSpacing: 2 });
  doc.text("QTY", colQty - 30, y, { width: 40, align: "right", characterSpacing: 2 });
  doc.text("UNIT EX VAT", colUnit - 50, y, { width: 70, align: "right", characterSpacing: 1.5 });
  doc.text("VAT %", colVat - 30, y, { width: 50, align: "right", characterSpacing: 2 });
  doc.text("LINE TOTAL", colLine - 70, y, { width: 70, align: "right", characterSpacing: 1.5 });
  y += 14;

  // Underline.
  drawHairline(doc, left, right, y, COLORS.ink, 0.6);
  y += 8;

  const rows = [...input.items];
  // Append shipping as a virtual row so it shows on the legal record.
  rows.push({
    name: "Shipping",
    sku: shippingNote(input.shipping.exclVat),
    quantity: 1,
    unitPriceExclVat: input.shipping.exclVat,
    vatRate: input.shipping.vatRate,
    lineTotalInclVat: input.shipping.inclVat,
  });

  for (const row of rows) {
    // Item: name (bold) + SKU/note (small grey, second line).
    doc
      .font(FONTS.sansBold)
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text(row.name, colItem, y, { width: 240 });
    if (row.sku) {
      doc
        .font(FONTS.sans)
        .fontSize(8)
        .fillColor(COLORS.inkSofter)
        .text(row.sku, colItem, y + 12, { width: 240 });
    }

    // Numeric columns. We anchor each value's right edge to the column anchor.
    doc
      .font(FONTS.sans)
      .fontSize(10)
      .fillColor(COLORS.ink);
    doc.text(String(row.quantity), colQty - 30, y, { width: 40, align: "right" });
    doc.text(formatEur(row.unitPriceExclVat), colUnit - 50, y, { width: 70, align: "right" });
    doc.text(formatPct(row.vatRate), colVat - 30, y, { width: 50, align: "right" });
    doc.text(formatEur(row.lineTotalInclVat), colLine - 70, y, { width: 70, align: "right" });

    y += row.sku ? 30 : 22;

    // Hairline between rows.
    drawHairline(doc, left, right, y - 6, COLORS.rule, 1);
  }

  return y + 12;
}

function drawTotals(
  doc: Doc,
  input: InvoicePdfInput,
  left: number,
  right: number,
  startY: number,
): number {
  // Totals block sits on the right half of the page — left half stays
  // empty so the eye lands on the grand total cleanly.
  const labelX = left + 290;
  const valueRight = right;
  const valueWidth = 90;
  let y = startY;

  doc.font(FONTS.sans).fontSize(10);

  function row(label: string, value: string, bold = false): void {
    doc.fillColor(COLORS.inkMid).font(bold ? FONTS.sansBold : FONTS.sans);
    doc.text(label, labelX, y, { width: 150 });
    doc.fillColor(COLORS.ink).font(bold ? FONTS.sansBold : FONTS.sans);
    doc.text(value, valueRight - valueWidth, y, {
      width: valueWidth,
      align: "right",
    });
    y += 16;
  }

  row("Subtotal excl. VAT", formatEur(input.totals.subtotalExclVat));
  row("VAT (21%)", formatEur(input.totals.vatTotal));
  row("Shipping", formatEur(input.shipping.inclVat));

  // Hairline above the grand total.
  y += 4;
  doc
    .save()
    .moveTo(labelX, y)
    .lineTo(valueRight, y)
    .lineWidth(0.8)
    .strokeColor(COLORS.ink)
    .stroke()
    .restore();
  y += 8;

  // Grand total — bold, vermilion mono for the value.
  doc
    .font(FONTS.sansBold)
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text("Total · paid", labelX, y);
  doc
    .font(FONTS.mono)
    .fontSize(12)
    .fillColor(COLORS.vermilion)
    .text(formatEur(input.totals.grandTotal), valueRight - valueWidth, y, {
      width: valueWidth,
      align: "right",
    });

  return y + 24;
}

function drawFooter(
  doc: Doc,
  input: InvoicePdfInput,
  left: number,
  right: number,
): void {
  // pin to bottom of page rather than tracking content y — keeps the
  // legal block in a predictable spot regardless of line-item count.
  const pageHeight = 842;
  const y = pageHeight - 78;

  drawHairline(doc, left, right, y - 12, COLORS.rule, 1);

  doc
    .font(FONTS.sans)
    .fontSize(8)
    .fillColor(COLORS.inkSoft);

  // Left column: payment + bank details.
  const payLines: string[] = [];
  if (input.paymentMethod) {
    payLines.push(`Payment received · via Mollie (${input.paymentMethod})`);
  }
  if (input.molliePaymentReference) {
    payLines.push(`Reference: ${input.molliePaymentReference}`);
  }
  payLines.push(`IBAN ${input.issuer.iban} · BIC ${input.issuer.bic}`);
  doc.text(payLines.join("\n"), left, y, { width: 280, lineGap: 2 });

  // Right column: company registry + thanks.
  const rightLines = [
    `${input.issuer.legalName} · ${input.issuer.rpm}`,
    "Thank you for choosing Asian Beauty Shop.",
    "asianbeautyshop.eu",
  ];
  doc.text(rightLines.join("\n"), left + 290, y, {
    width: right - (left + 290),
    align: "right",
    lineGap: 2,
  });
}

// ────────── Helpers ─────────────────────────────────────────────────────

function formatEur(amount: number): string {
  // Locale-neutral euro formatting — accountant-friendly. Uses non-breaking
  // space between currency and amount because pdfkit handles   cleanly.
  const fixed = amount.toFixed(2);
  return `€ ${fixed}`;
}

function formatPct(rate: number): string {
  // 0.21 → "21%". One decimal if needed, else integer.
  const pct = rate * 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function formatDate(d: Date): string {
  // EN long form — Belgian accountants are bilingual; English avoids
  // ambiguity around 1/2/2026 vs 2/1/2026.
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function shippingNote(exclVat: number): string {
  if (exclVat === 0) return "Free over €50 / digital order";
  return "Standard shipping";
}
