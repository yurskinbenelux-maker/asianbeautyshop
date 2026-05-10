// ─────────────────────────────────────────────────────────────────────────
// GET /admin/credit-notes/[id]/download
//
// Mirror of /admin/invoices/[id]/download — mints a 60-second signed
// Supabase Storage URL for the credit-note PDF and 302-redirects the
// admin's browser there. Same private-bucket + short-TTL discipline as
// invoices: the PDF is a legal document, the URL must not leak.
//
// If the credit note exists but its pdfPath is null (PDF mint failed at
// issuance time — rare, but defensible), we lazily re-mint via
// mintCreditNotePdf before serving. The legal record (the CreditNote
// row) is already valid; the PDF is just a rendering of it.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  mintCreditNotePdf,
  signedCreditNoteUrl,
} from "@/lib/credit-notes/issue";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  await requireAdmin();
  const { id } = await params;

  const cn = await prisma.creditNote.findUnique({
    where: { id },
    select: { pdfPath: true, number: true },
  });
  if (!cn) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Lazy mint — covers the rare case where issuance succeeded but the
  // best-effort PDF step inside issueRefundAndCreditNote failed. The
  // credit note row exists with all the legal data; we just need to
  // render it on first download.
  let pdfPath = cn.pdfPath;
  if (!pdfPath) {
    try {
      const minted = await mintCreditNotePdf(id);
      pdfPath = minted.pdfPath;
    } catch (err) {
      console.error("[admin/credit-notes/download] lazy mint failed", err);
      return new NextResponse("PDF render failed", { status: 500 });
    }
  }

  try {
    const url = await signedCreditNoteUrl(pdfPath);
    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("[admin/credit-notes/download] sign failed", err);
    return new NextResponse("Sign failed", { status: 500 });
  }
}
