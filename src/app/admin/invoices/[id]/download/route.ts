// ─────────────────────────────────────────────────────────────────────────
// GET /admin/invoices/[id]/download
//
// Mints a 60-second signed Supabase Storage URL for the invoice PDF and
// 302-redirects the admin's browser there. The PDF lives in a private
// bucket — direct download links would expose the storage URL pattern
// permanently. Signed URLs expire fast, which limits the blast radius
// of a leaked link.
//
// Auth-gated: only ADMIN role users can hit this route. Customer-side
// download is deliberately not built — invoices arrive via email.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { signedInvoiceUrl } from "@/lib/invoices/issue";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  await requireAdmin();
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { pdfPath: true, number: true },
  });
  if (!invoice) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const url = await signedInvoiceUrl(invoice.pdfPath);
    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("[admin/invoices/download] sign failed", err);
    return new NextResponse("Sign failed", { status: 500 });
  }
}
