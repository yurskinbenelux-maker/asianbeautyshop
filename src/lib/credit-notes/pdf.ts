// ─────────────────────────────────────────────────────────────────────────
// Credit-note PDF renderer — A4, branded Asian Beauty Shop, server-side.
//
// Mirrors src/lib/invoices/pdf.ts with credit-note-specific changes:
//
//   · Masthead title: "Credit note" instead of "Invoice"
//   · Number: CN-2026-NNNNN (vermilion mono, same right-aligned slot)
//   · Dates row: "Issue date · Refers to invoice" (not "Supply date · Order ref")
//   · A prominent "Refers to invoice INV-2026-NNNNN" callout under the
//     dates row — Belgian Code TVA Art. 53octies requires the credit
//     note to reference the original invoice number explicitly.
//   · Items table: A1 captures only the totals (no per-line breakdown
//     yet — that arrives with G9), so we show a single synthesised line
//     "Refund · return ABS-1042-R1" with the refunded amount. When G9
//     ships, this becomes one row per refunded ProductVariant.
//   · Totals label: "Total credited" (the value is shown as a positive
//     number — Belgian credit-note convention has the sign implicit
//     from the document type, not the figure itself).
//   · Footer: "Refund processed · via Mollie (re_xxxx)" instead of
//     "Payment received"
//
// The visual chrome (colours, hairlines, margins, typography) is held
// to the existing invoice palette so an accountant filing both
// documents in the same folder reads them as a coherent pair.
// ─────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

// ────────── Brand assets — single-load cache ────────────────────────────
//
// Mirrors the invoice renderer. Loads the wordmark once per Node process;
// subsequent CN renders pay zero IO. Falls back to text if the file
// vanishes from the deploy (defensive — the same outputFileTracingIncludes
// gap that bit pdfkit's .afm files could in principle bite a public/ asset
// too, but we'd rather degrade than crash).

const LOGO_PATH = path.join(
  process.cwd(),
  "public/brand/exports/email-logo-wordmark.png",
);
let _cachedLogo: Buffer | null = null;
let _logoMissingLogged = false;
function loadLogo(): Buffer | null {
  if (_cachedLogo) return _cachedLogo;
  try {
    _cachedLogo = fs.readFileSync(LOGO_PATH);
    return _cachedLogo;
  } catch (err) {
    if (!_logoMissingLogged) {
      console.error("[credit-notes/pdf] logo file missing", LOGO_PATH, err);
      _logoMissingLogged = true;
    }
    return null;
  }
}

// Unicode font buffers — same setup as invoices/pdf.ts. Without these
// the customer name (often Cyrillic for RU customers) and the U+2212
// minus character render as gibberish in the credit-note PDF.
const FONT_DIR = path.join(process.cwd(), "public/fonts");
const FONT_REGULAR_PATH = path.join(FONT_DIR, "NotoSans-Regular.ttf");
const FONT_BOLD_PATH = path.join(FONT_DIR, "NotoSans-Bold.ttf");
let _cachedFontRegular: Buffer | null = null;
let _cachedFontBold: Buffer | null = null;
let _fontMissingLogged = false;
function loadFonts(): { regular: Buffer | null; bold: Buffer | null } {
  if (_cachedFontRegular && _cachedFontBold) {
    return { regular: _cachedFontRegular, bold: _cachedFontBold };
  }
  try {
    _cachedFontRegular = fs.readFileSync(FONT_REGULAR_PATH);
    _cachedFontBold = fs.readFileSync(FONT_BOLD_PATH);
    return { regular: _cachedFontRegular, bold: _cachedFontBold };
  } catch (err) {
    if (!_fontMissingLogged) {
      console.error(
        "[credit-notes/pdf] Noto Sans TTF missing — credit notes will fall back to Helvetica and may garble non-Latin text",
        FONT_DIR,
        err,
      );
      _fontMissingLogged = true;
    }
    return { regular: null, bold: null };
  }
}

function registerBodyFonts(doc: InstanceType<typeof PDFDocument>): boolean {
  const { regular, bold } = loadFonts();
  if (regular && bold) {
    doc.registerFont("sans", regular);
    doc.registerFont("sansBold", bold);
    return true;
  }
  doc.registerFont("sans", "Helvetica");
  doc.registerFont("sansBold", "Helvetica-Bold");
  return false;
}

// ────────── Public types ────────────────────────────────────────────────

export type CreditNoteIssuerSnapshot = {
  legalName: string;
  street: string;
  cityZip: string;
  country: string;
  vatNumber: string;
  email: string;
  iban: string;
  bic: string;
  rpm: string;
};

export type CreditNoteCustomerSnapshot = {
  name: string;
  email: string;
  street?: string | null;
  cityZip?: string | null;
  country?: string | null;
};

export type CreditNoteLineItem = {
  /** Display name, e.g. "Refund · return ABS-1042-R1" or product name on G9. */
  description: string;
  /** Optional reference (return number, SKU, etc.) shown small under name. */
  reference?: string | null;
  quantity: number;
  unitPriceExclVat: number;
  vatRate: number;
  lineTotalInclVat: number;
};

export type CreditNotePdfInput = {
  number: string;            // "CN-2026-00042"
  issueDate: Date;
  invoiceNumber: string;     // "INV-2026-00042" — required by Belgian law
  invoiceIssuedAt: Date;
  orderPublicNumber: string; // "ABS-1042"
  returnPublicNumber: string | null; // "ABS-1042-R1" or null for non-RMA credit notes
  /** Credit-note reason — printed as a small badge above the items table. */
  reason: string;
  reasonNote: string | null;
  issuer: CreditNoteIssuerSnapshot;
  customer: CreditNoteCustomerSnapshot;
  items: CreditNoteLineItem[];
  shipping: { exclVat: number; vatRate: number; inclVat: number };
  totals: {
    subtotalExclVat: number;
    vatTotal: number;
    grandTotal: number;
  };
  /** Mollie refund id (re_xxxx) for the footer reference. Null if external refund. */
  mollieRefundReference: string | null;
};

// ────────── Brand tokens ────────────────────────────────────────────────

const COLORS = {
  ink: "#121110",
  inkMid: "#3D3935",
  inkSoft: "#6F6A65",
  inkSofter: "#8A8A8A",
  vermilion: "#C8102E",
  rule: "#E8DFD0",
  // Soft sage — credit notes get a subtle sage callout band on the
  // "refers to" line to differentiate from invoices at a glance.
  sage: "#7A8B6F",
};

// Body sans is Noto Sans (registered per-doc → supports Cyrillic/U+2212).
// Times/Courier stay as PDFKit built-ins — only used for ASCII content.
const FONTS = {
  serif: "Times-Roman",
  serifBold: "Times-Bold",
  sans: "sans",         // registered per-doc → Noto Sans Regular (Helvetica fallback)
  sansBold: "sansBold", // registered per-doc → Noto Sans Bold    (Helvetica-Bold fallback)
  mono: "Courier",
};

// ────────── Public API ──────────────────────────────────────────────────

export async function renderCreditNotePdf(
  input: CreditNotePdfInput,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
        info: {
          Title: input.number,
          Author: input.issuer.legalName,
          Subject: `Credit note ${input.number} (refers to ${input.invoiceNumber})`,
          Producer: "Asian Beauty Shop",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Register Unicode body fonts before any text is drawn.
      registerBodyFonts(doc);

      drawDocument(doc, input);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ────────── Layout ──────────────────────────────────────────────────────

type Doc = InstanceType<typeof PDFDocument>;

function drawDocument(doc: Doc, input: CreditNotePdfInput): void {
  const left = 36;
  const right = 559;
  const innerWidth = right - left;

  drawMasthead(doc, input, left, right);
  drawHairline(doc, left, right, 110, COLORS.vermilion, 0.7);

  let y = 130;
  y = drawIssuerCustomer(doc, input, left, innerWidth, y);
  y = drawDates(doc, input, left, innerWidth, y);
  y = drawInvoiceReferenceCallout(doc, input, left, right, y);
  y = drawLinesTable(doc, input, left, right, y);
  y = drawTotals(doc, input, left, right, y);

  drawFooter(doc, input, left, right);
}

function drawMasthead(
  doc: Doc,
  input: CreditNotePdfInput,
  left: number,
  right: number,
): void {
  const logo = loadLogo();
  if (logo) {
    doc.image(logo, left, 38, { width: 140 });
  } else {
    doc
      .font(FONTS.serifBold)
      .fontSize(16)
      .fillColor(COLORS.ink)
      .text("Asian Beauty Shop", left, 46);
  }

  // Right-side title — "Credit note" instead of "Invoice".
  doc
    .font(FONTS.serif)
    .fontSize(20)
    .fillColor(COLORS.ink)
    .text("Credit note", left, 42, { width: right - left, align: "right" });
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
  input: CreditNotePdfInput,
  left: number,
  innerWidth: number,
  y: number,
): number {
  const colWidth = (innerWidth - 24) / 2;
  const rightCol = left + colWidth + 24;

  doc
    .font(FONTS.sans)
    .fontSize(7)
    .fillColor(COLORS.inkSofter)
    .text("ISSUED BY", left, y, { characterSpacing: 2 });
  doc.text("CREDIT TO", rightCol, y, { characterSpacing: 2 });

  const { issuer, customer } = input;
  doc
    .font(FONTS.sansBold)
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text(issuer.legalName, left, y + 14, { width: colWidth });
  doc.font(FONTS.sans).fontSize(9).fillColor(COLORS.inkMid);
  doc.text(issuer.street, left, doc.y, { width: colWidth });
  doc.text(issuer.cityZip, left, doc.y, { width: colWidth });
  doc.text(`VAT ${issuer.vatNumber}`, left, doc.y, { width: colWidth });
  doc.text(issuer.email, left, doc.y, { width: colWidth });
  const issuerEndY = doc.y;

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
  input: CreditNotePdfInput,
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
  doc.text("ORIGINAL ORDER", rightCol, y, { characterSpacing: 2 });

  doc.font(FONTS.sans).fontSize(10).fillColor(COLORS.inkMid);
  doc.text(formatDate(input.issueDate), left, y + 12);

  // Order ref (and return ref if present) on the right.
  const orderRef = input.returnPublicNumber
    ? `#${input.orderPublicNumber} · ${input.returnPublicNumber}`
    : `#${input.orderPublicNumber}`;
  doc.text(orderRef, rightCol, y + 12);

  return y + 36;
}

/**
 * Big sage callout band: "This credit note relates to invoice INV-2026-NNNNN".
 * Belgian VAT law requires this reference; making it visually prominent
 * also helps the accountant who's matching CN ↔ invoice pairs by sight.
 */
function drawInvoiceReferenceCallout(
  doc: Doc,
  input: CreditNotePdfInput,
  left: number,
  right: number,
  y: number,
): number {
  const height = 32;
  // Soft sage band as a subtle differentiator from invoices.
  doc
    .save()
    .rect(left, y, right - left, height)
    .fillColor(COLORS.sage)
    .opacity(0.08)
    .fill()
    .restore();

  doc
    .font(FONTS.sans)
    .fontSize(8)
    .fillColor(COLORS.inkSoft)
    .text("REFERS TO INVOICE", left + 12, y + 8, { characterSpacing: 2 });
  doc
    .font(FONTS.mono)
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text(input.invoiceNumber, left + 12, y + 18);

  // Right side of the band: issued date of the original invoice + reason.
  doc
    .font(FONTS.sans)
    .fontSize(8)
    .fillColor(COLORS.inkSoft)
    .text(
      `${formatDate(input.invoiceIssuedAt)} · ${reasonLabel(input.reason)}`,
      left,
      y + 12,
      { width: right - left - 12, align: "right" },
    );

  return y + height + 18;
}

function drawLinesTable(
  doc: Doc,
  input: CreditNotePdfInput,
  left: number,
  right: number,
  startY: number,
): number {
  const colItem = left;
  const colQty = left + 250;
  const colUnit = left + 320;
  const colVat = left + 415;
  const colLine = right;

  let y = startY;

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

  drawHairline(doc, left, right, y, COLORS.ink, 0.6);
  y += 8;

  // A1 phase: typically a single synthesised line. G9 (per-line refunds)
  // will populate `items` with one row per ProductVariant.
  for (const row of input.items) {
    doc
      .font(FONTS.sansBold)
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text(row.description, colItem, y, { width: 240 });
    if (row.reference) {
      doc
        .font(FONTS.sans)
        .fontSize(8)
        .fillColor(COLORS.inkSofter)
        .text(row.reference, colItem, y + 12, { width: 240 });
    }

    doc
      .font(FONTS.sans)
      .fontSize(10)
      .fillColor(COLORS.ink);
    doc.text(String(row.quantity), colQty - 30, y, { width: 40, align: "right" });
    doc.text(formatEur(row.unitPriceExclVat), colUnit - 50, y, { width: 70, align: "right" });
    doc.text(formatPct(row.vatRate), colVat - 30, y, { width: 50, align: "right" });
    doc.text(formatEur(row.lineTotalInclVat), colLine - 70, y, { width: 70, align: "right" });

    y += row.reference ? 30 : 22;
    drawHairline(doc, left, right, y - 6, COLORS.rule, 1);
  }

  return y + 12;
}

function drawTotals(
  doc: Doc,
  input: CreditNotePdfInput,
  left: number,
  right: number,
  startY: number,
): number {
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
  row(
    `VAT (${formatPct(input.shipping.vatRate)})`,
    formatEur(input.totals.vatTotal),
  );
  if (input.shipping.inclVat > 0) {
    row("Shipping", formatEur(input.shipping.inclVat));
  }

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

  // Grand total — labelled "Total credited" so the customer reads it
  // as money flowing back, not another bill. Sage tone for the value
  // (vs vermilion on invoices) reinforces the difference.
  doc
    .font(FONTS.sansBold)
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text("Total credited", labelX, y);
  doc
    .font(FONTS.mono)
    .fontSize(12)
    .fillColor(COLORS.sage)
    .text(formatEur(input.totals.grandTotal), valueRight - valueWidth, y, {
      width: valueWidth,
      align: "right",
    });

  return y + 24;
}

function drawFooter(
  doc: Doc,
  input: CreditNotePdfInput,
  left: number,
  right: number,
): void {
  const pageHeight = 842;
  const y = pageHeight - 92;

  drawHairline(doc, left, right, y - 12, COLORS.rule, 1);

  doc
    .font(FONTS.sans)
    .fontSize(8)
    .fillColor(COLORS.inkSoft);

  // Left column: refund + bank details.
  const payLines: string[] = [];
  payLines.push("Refund processed via Mollie");
  if (input.mollieRefundReference) {
    payLines.push(`Reference: ${input.mollieRefundReference}`);
  }
  payLines.push(`IBAN ${input.issuer.iban} · BIC ${input.issuer.bic}`);
  if (input.reasonNote) {
    payLines.push(`Note: ${input.reasonNote}`);
  }
  doc.text(payLines.join("\n"), left, y, { width: 280, lineGap: 2 });

  // Right column: registry + thanks.
  const rightLines = [
    `${input.issuer.legalName} · ${input.issuer.rpm}`,
    "Asian Beauty Shop · asianbeautyshop.eu",
  ];
  doc.text(rightLines.join("\n"), left + 290, y, {
    width: right - (left + 290),
    align: "right",
    lineGap: 2,
  });
}

// ────────── Helpers ─────────────────────────────────────────────────────

function formatEur(amount: number): string {
  return `€ ${amount.toFixed(2)}`;
}

function formatPct(rate: number): string {
  const pct = rate * 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function formatDate(d: Date): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function reasonLabel(reason: string): string {
  // Match the CreditNoteReason enum values.
  switch (reason) {
    case "RETURN":           return "Return";
    case "CANCELLATION":     return "Cancellation";
    case "PRICE_ADJUSTMENT": return "Price adjustment";
    case "GOODWILL":         return "Goodwill credit";
    case "DUPLICATE":        return "Duplicate invoice";
    default:                 return reason;
  }
}
