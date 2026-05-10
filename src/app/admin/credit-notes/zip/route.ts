// ─────────────────────────────────────────────────────────────────────────
// GET /admin/credit-notes/zip?year=YYYY&quarter=N
//
// Streams a ZIP archive of every credit-note PDF issued in the selected
// Belgian VAT period. Sibling to /admin/invoices/zip — shares the same
// quarter parsing, the same Belgian fiscal-quarter convention, and the
// same streaming-via-archiver discipline.
//
// Credit notes share the `invoices` Supabase Storage bucket but live
// under the `creditnotes/<year>/` prefix (see CREDIT_NOTES_PREFIX in
// lib/credit-notes/issue.ts). We don't expose a separate bucket setting
// because there's no operational reason to split them; the legal
// retention rules are identical (10-year company law + 7-year VAT-side).
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

  const creditNotes = await prisma.creditNote.findMany({
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

  if (creditNotes.length === 0) {
    return new Response(
      `No credit notes found for ${quarterSlug(scope)}.`,
      { status: 404, headers: { "Content-Type": "text/plain" } },
    );
  }

  const supa = supabaseAdmin();
  const archive = archiver("zip", { zlib: { level: 5 } });

  archive.on("warning", (err) => {
    console.warn("[admin/credit-notes/zip] archiver warning", err);
  });
  archive.on("error", (err) => {
    console.error("[admin/credit-notes/zip] archiver error", err);
  });

  (async () => {
    try {
      for (const cn of creditNotes) {
        if (!cn.pdfPath) {
          // pdfPath null means A7's best-effort PDF mint failed at
          // issuance and admin hasn't clicked the per-row PDF button to
          // trigger the lazy re-render yet. Skip rather than abort —
          // admin sees the row missing from the ZIP and can re-download
          // individually to lazy-mint, then re-run this export.
          console.warn(
            `[admin/credit-notes/zip] CN ${cn.number} has null pdfPath — skipping`,
          );
          continue;
        }
        const { data, error } = await supa.storage
          .from(INVOICES_BUCKET)
          .download(cn.pdfPath);
        if (error || !data) {
          console.warn(
            `[admin/credit-notes/zip] download failed for ${cn.number}`,
            error,
          );
          continue;
        }
        const buffer = Buffer.from(await data.arrayBuffer());
        archive.append(buffer, { name: `${cn.number}.pdf` });
      }
      await archive.finalize();
    } catch (err) {
      console.error("[admin/credit-notes/zip] fatal during stream", err);
      archive.abort();
    }
  })();

  const webStream = Readable.toWeb(archive) as unknown as ReadableStream;
  const filename = `credit-notes-${quarterSlug(scope)}.zip`;
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
