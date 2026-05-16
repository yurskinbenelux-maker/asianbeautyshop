// ─────────────────────────────────────────────────────────────────────────
// GET /admin/invoices/zip?year=YYYY&quarter=N
//
// Streams a ZIP archive of every invoice PDF issued in the selected
// Belgian VAT period — what Sofia hands to her accountant once per
// quarter for the BTW-aangifte. Companion to the G6 CSV export
// (/admin/vat-export/csv): the CSV gives the line-level numbers, this
// ZIP gives the actual PDFs auditors may ask to see.
//
// Why streaming (vs build-then-send):
//   · Memory ceiling is tight on Hostinger Business (Node workers share
//     a small pool). Streaming via archiver means we never hold all PDFs
//     in RAM at once — one buffer downloads, gets piped into the ZIP,
//     and is released before the next.
//   · The browser sees Content-Disposition + the first bytes immediately
//     so admin gets a download dialog without staring at a blank page
//     while 80 PDFs are assembled.
//
// Auth: requireAdmin() at the top — same posture as every other admin
// PDF route. No-cache header so the same URL can't be replayed from a
// browser cache after admin logs out.
// ─────────────────────────────────────────────────────────────────────────

import { type NextRequest } from "next/server";
import archiver from "archiver";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { INVOICES_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import {
  parseQuarterParams,
  quarterSlug,
  quarterWindow,
} from "@/lib/utils/quarter";

// Force the Node runtime — archiver depends on node:stream + zlib + Buffer
// which are not in the Edge runtime feature set.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const scope = parseQuarterParams(
    searchParams.get("year"),
    searchParams.get("quarter"),
  );
  const window = quarterWindow(scope);

  // Fetch invoices in the selected window. When scope is "all" we cap at
  // the latest 500 — defensive ceiling so admin doesn't accidentally
  // queue an unbounded download. In real usage admin almost always
  // narrows to a quarter, which keeps the count well under that.
  const invoices = await prisma.invoice.findMany({
    where: window
      ? { issuedAt: { gte: window.periodStart, lt: window.periodEnd } }
      : undefined,
    orderBy: { issuedAt: "asc" },
    take: window ? undefined : 500,
    select: {
      number: true,
      pdfPath: true,
    },
  });

  if (invoices.length === 0) {
    return new Response(
      `No invoices found for ${quarterSlug(scope)}.`,
      { status: 404, headers: { "Content-Type": "text/plain" } },
    );
  }

  const supa = supabaseAdmin();

  // ── Build the ZIP via archiver ────────────────────────────────────
  // Level 5 is the archiver default; PDFs barely compress (already
  // compressed internally) so we leave the default — CPU time saved
  // matters more than a few KB shaved.
  const archive = archiver("zip", { zlib: { level: 5 } });

  // Pipe archive into a Node Readable we can hand back to Response.
  // archiver itself is a Readable, so we can convert directly with
  // Readable.toWeb() — Node 20+ supports this natively.
  archive.on("warning", (err) => {
    // ENOENT is the soft warning archiver fires when a file is missing;
    // we already pre-checked pdfPath, so this should never fire — log
    // anyway so a real corner case is observable.
    console.warn("[admin/invoices/zip] archiver warning", err);
  });
  archive.on("error", (err) => {
    console.error("[admin/invoices/zip] archiver error", err);
    // Note: throwing here would break the in-flight stream. We log and
    // let the consumer see a truncated ZIP — partial download is more
    // recoverable than no response.
  });

  // Stream PDFs into the archive in series. We do NOT parallelise the
  // downloads — Supabase Storage's free-tier rate limits are easy to
  // bump into, and one-by-one is fine for the ~tens-per-quarter volume
  // we'll see at launch. If volumes climb past a few hundred per
  // quarter, this is the obvious spot to add bounded concurrency.
  (async () => {
    try {
      for (const inv of invoices) {
        if (!inv.pdfPath) {
          // PDF wasn't rendered at issuance — extremely rare, A7's mint
          // is best-effort but we always retry. Skip the file rather
          // than failing the whole archive; admin can re-download
          // individually from /admin/invoices.
          console.warn(
            `[admin/invoices/zip] invoice ${inv.number} has null pdfPath — skipping`,
          );
          continue;
        }
        const { data, error } = await supa.storage
          .from(INVOICES_BUCKET)
          .download(inv.pdfPath);
        if (error || !data) {
          console.warn(
            `[admin/invoices/zip] download failed for ${inv.number}`,
            error,
          );
          continue;
        }
        const buffer = Buffer.from(await data.arrayBuffer());
        archive.append(buffer, { name: `${inv.number}.pdf` });
      }
      await archive.finalize();
    } catch (err) {
      console.error("[admin/invoices/zip] fatal during stream", err);
      archive.abort();
    }
  })();

  // Convert the Node Readable into a WHATWG ReadableStream for the
  // Response. Node 20's Readable.toWeb does this cleanly.
  const webStream = Readable.toWeb(archive) as unknown as ReadableStream;

  const filename = `invoices-${quarterSlug(scope)}.zip`;
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
