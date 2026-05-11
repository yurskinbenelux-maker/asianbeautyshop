// ─────────────────────────────────────────────────────────────────────────
// Invoice PDF renderer — A4, branded Asian Beauty Shop, server-side via pdfkit.
//
// Why pdfkit: zero-dep at runtime besides the package itself, no headless
// browser needed, runs cleanly on Hostinger Node. Output is a Buffer that
// the issue orchestrator uploads to Supabase Storage and attaches to the
// order confirmation email.
//
// Layout mirrors the visual mockup approved by Max:
//   · Top: Asian Beauty Shop wordmark lockup on the left, "Invoice"
//     title + INV-2026-NNNNN number on the right
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

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

// ────────── Brand assets ────────────────────────────────────────────────
//
// Read the wordmark once per Node process — module load runs once per
// worker on Hostinger, so subsequent invoice renders pay zero IO. If the
// file is missing on this deploy (theoretically possible if public/ gets
// pruned by a misconfigured rsync), drawMasthead falls back to text
// rather than crashing the invoice.
//
// 960x320 PNG → 3:1 — sized for the email header but reads beautifully
// at ~130pt wide on A4. Lives in public/brand/exports/ alongside the
// other exported brand renditions.

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
      console.error("[invoice/pdf] logo file missing", LOGO_PATH, err);
      _logoMissingLogged = true;
    }
    return null;
  }
}

// Unicode font buffers — Noto Sans regular + bold. PDFKit's built-in
// Helvetica only supports WinAnsi (Latin-1), which mangles Cyrillic
// customer names, French accents, and the U+2212 minus sign in the
// discount line. We register Noto Sans as the body font so any
// language renders correctly and the discount minus shows as "−" not '"'.
//
// Fonts live in public/fonts/ and are committed to the repo (~330 KB
// each, OFL-licensed). Cached at module load — Hostinger's worker
// reads them once and reuses across invoice renders. If a TTF goes
// missing on a deploy we fall back to Helvetica with a logged warning
// so an invoice still renders rather than 500'ing the webhook.
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
        "[invoice/pdf] Noto Sans TTF missing — invoices will fall back to Helvetica and may garble non-Latin text",
        FONT_DIR,
        err,
      );
      _fontMissingLogged = true;
    }
    return { regular: null, bold: null };
  }
}

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
    /** When set, renders a vermilion "Discount" line between the
     *  subtotal and shipping rows. The amount is the discount value
     *  including VAT (the same number that's stored on
     *  Order.discountTotal and what the customer saw in checkout's
     *  preview). Omitted / 0 → no discount line rendered. The label
     *  is typically the coupon code, e.g. "ABS-WELCOME-XXXX". */
    discount?: {
      label: string;
      amount: number;
    };
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

// Body sans is Noto Sans (registered per-doc in renderInvoicePdf so it
// supports Cyrillic/Greek/diacritics/Unicode minus sign). Times-Roman
// and Courier are PDFKit built-ins — only used for ASCII content
// (masthead "Invoice" title and the invoice number), so Latin-1 is
// fine for those.
//
// When the Noto TTFs are missing on disk, registerBodyFonts() falls
// back to Helvetica + Helvetica-Bold so the invoice still renders.
const FONTS = {
  serif: "Times-Roman",
  serifBold: "Times-Bold",
  sans: "sans",         // registered per-doc → Noto Sans Regular (or Helvetica fallback)
  sansBold: "sansBold", // registered per-doc → Noto Sans Bold    (or Helvetica-Bold fallback)
  mono: "Courier",
};

/**
 * Register the body sans fonts on this doc. Returns whether the
 * Unicode-capable Noto Sans was loaded — false means we registered
 * Helvetica aliases instead, and non-Latin text will be garbled.
 */
function registerBodyFonts(doc: InstanceType<typeof PDFDocument>): boolean {
  const { regular, bold } = loadFonts();
  if (regular && bold) {
    doc.registerFont("sans", regular);
    doc.registerFont("sansBold", bold);
    return true;
  }
  // Fallback path — alias the missing names to PDFKit built-ins so
  // doc.font("sans") still resolves to something. Non-Latin text
  // will mangle but the invoice will at least render.
  doc.registerFont("sans", "Helvetica");
  doc.registerFont("sansBold", "Helvetica-Bold");
  return false;
}

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
  const hasVouchers = input.items.some((it) => it.vatRate === 0);
  y = drawLinesTable(doc, input, left, right, y);
  if (hasVouchers) {
    y = drawVoucherFootnote(doc, left, right, y);
  }
  y = drawTotals(doc, input, left, right, y);

  drawFooter(doc, input, left, right);
}

function drawMasthead(
  doc: Doc,
  input: InvoicePdfInput,
  left: number,
  right: number,
): void {
  // Brand wordmark — Asian Beauty Shop horizontal lockup (cherry blossom
  // + ASIAN BEAUTY SHOP). Source PNG is 960x320 (3:1); we scale to
  // ~140pt wide which renders the wordmark cleanly at print resolution
  // without looking heavy against the right-side "Invoice" title.
  //
  // If the file is missing on this deploy (loadLogo logs once and
  // returns null), we draw a serif text fallback so the invoice still
  // renders — better than 500'ing the order confirmation email.
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

  // Right-side title + invoice number — unchanged. Vertical positions
  // match the masthead's visual mid-line so the invoice number sits
  // on the same baseline as the bottom of the wordmark.
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
    // VAT % column — render an em-dash for out-of-scope lines (gift
    // cards / Multi-Purpose Vouchers under EU Dir 2016/1065). Footnote
    // explains why, added once below the table if any voucher row was
    // rendered.
    doc.text(
      row.vatRate === 0 ? "—" : formatPct(row.vatRate),
      colVat - 30,
      y,
      { width: 50, align: "right" },
    );
    doc.text(formatEur(row.lineTotalInclVat), colLine - 70, y, { width: 70, align: "right" });

    y += row.sku ? 30 : 22;

    // Hairline between rows.
    drawHairline(doc, left, right, y - 6, COLORS.rule, 1);
  }

  return y + 12;
}

/**
 * Footnote shown below the line items table when the order contains
 * one or more gift cards (Multi-Purpose Vouchers). EU Dir 2016/1065
 * + Belgian VAT code require disclosure that the voucher portion is
 * out of scope for VAT at sale; tax is due at redemption against the
 * actual goods supplied. Without this footnote, an auditor reading
 * the invoice can't tell why the VAT base is lower than the line-item
 * total suggests.
 */
function drawVoucherFootnote(
  doc: Doc,
  left: number,
  right: number,
  y: number,
): number {
  doc
    .font(FONTS.sans)
    .fontSize(7.5)
    .fillColor(COLORS.inkSofter)
    .text(
      "— Gift cards are Multi-Purpose Vouchers (EU Dir 2016/1065). " +
        "Out of scope for VAT at sale; tax is due at redemption " +
        "against the goods then supplied.",
      left,
      y,
      { width: right - left, lineGap: 1 },
    );
  return doc.y + 8;
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
  // Coupon discount line (Option B per H-fix). Sits between subtotal
  // and shipping so the eye reads "products − discount = what you
  // paid for the products, then add shipping and tax." Belgian Royal
  // Decree no. 1 art. 5 requires the discount to be visible on the
  // invoice — either pro-rated across lines or shown as a separate
  // line; we chose the line approach so line items keep retail prices
  // (useful for warranty + return value disputes).
  if (input.totals.discount && input.totals.discount.amount > 0) {
    const d = input.totals.discount;
    doc.fillColor(COLORS.vermilion).font(FONTS.sans);
    doc.text(`Discount · ${d.label}`, labelX, y, { width: 200 });
    doc.text(`− ${formatEur(d.amount)}`, valueRight - valueWidth, y, {
      width: valueWidth,
      align: "right",
    });
    y += 16;
  }
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
