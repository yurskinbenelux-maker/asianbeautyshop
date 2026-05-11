// ─────────────────────────────────────────────────────────────────────────
// GET /[locale]/account/orders/[number]/invoice  (G12)
//
// Customer-facing invoice download. The confirmation email has the PDF
// attached, but corporate spam filters love stripping attachments and
// customers occasionally need the file from a different device than the
// one their email is on. This route is the fallback CTA — same legal
// PDF, served from a signed Storage URL.
//
// Auth: signed-in customer only, AND the order must belong to them. We
// load by Order.publicNumber (the customer-visible "ABS-1042" string)
// scoped to userId, so number-guessing can't reach somebody else's
// invoice.
//
// Guest checkouts (no userId on the order) deliberately can't use this
// route — they don't have an account to authenticate against. Their
// fallback is to dig out the original confirmation email or contact us.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/auth";
import { signedInvoiceUrl } from "@/lib/invoices/issue";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ locale: string; number: string }> },
): Promise<NextResponse> {
  const { locale, number } = await params;

  const current = await getCurrentCustomer();
  if (!current) {
    // Bounce to sign-in with the invoice URL preserved as `next` so
    // they land back here after authentication. Same pattern the
    // requireCustomer helper uses for page renders.
    const next = encodeURIComponent(
      `/${locale}/account/orders/${number}/invoice`,
    );
    return NextResponse.redirect(
      new URL(`/${locale}/sign-in?next=${next}`, _request.url),
      302,
    );
  }

  // Order must belong to this customer. We look up by publicNumber
  // (URL slug) AND userId so number-guessing can't enumerate other
  // people's invoices.
  const order = await prisma.order.findFirst({
    where: { publicNumber: number, userId: current.profile.id },
    select: {
      id: true,
      invoice: { select: { pdfPath: true, number: true } },
    },
  });
  if (!order) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!order.invoice) {
    // Order exists but no invoice has been issued yet — pre-PAID,
    // failed payment, or the issue pipeline hiccupped. Customer will
    // get the email later when invoice mints. 404 keeps things
    // simple; we could redirect to the order page with a flash, but
    // a clean 404 is the standard contract for "file isn't here".
    return new NextResponse("Invoice not yet issued", { status: 404 });
  }

  try {
    const url = await signedInvoiceUrl(order.invoice.pdfPath);
    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("[account/orders/invoice] sign failed", err);
    return new NextResponse("Sign failed", { status: 500 });
  }
}
