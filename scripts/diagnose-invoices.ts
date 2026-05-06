// Diagnose why invoices aren't being generated.
//
// Walks the most recent PAID orders, checks whether each has an Invoice
// row, then introspects the bits that could silently break invoice
// issuance:
//   · Setting row for invoice.next.<year> (numbering bootstrap)
//   · Supabase "invoices" bucket exists + write-accessible
//   · Last attempt to issue (try the orchestrator and surface the throw)
//
// Read-only against the orders themselves, but WILL try a real issue on
// the most recent PAID-without-invoice if you pass --issue. Without that
// flag it dry-runs.
//
// Run: pnpm tsx scripts/diagnose-invoices.ts
//      pnpm tsx scripts/diagnose-invoices.ts --issue

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const shouldIssue = process.argv.includes("--issue");
const INVOICES_BUCKET = "invoices";

async function main() {
  // 1. Latest 10 PAID orders + whether they have invoices.
  const recent = await prisma.order.findMany({
    where: { status: { in: ["PAID", "SHIPPED", "DELIVERED"] } },
    orderBy: { paidAt: "desc" },
    take: 10,
    select: {
      id: true,
      publicNumber: true,
      email: true,
      grandTotal: true,
      currency: true,
      paidAt: true,
      invoiceUrl: true,
      status: true,
    },
  });

  const orderIds = recent.map((o) => o.id);
  const invoices = await prisma.invoice.findMany({
    where: { orderId: { in: orderIds } },
    select: { orderId: true, number: true, pdfPath: true, issuedAt: true },
  });
  const byOrder = new Map(invoices.map((i) => [i.orderId, i]));

  console.log("─── Recent PAID orders + invoice status ───");
  for (const o of recent) {
    const inv = byOrder.get(o.id);
    const flag = inv ? `INVOICE ${inv.number}` : "NO INVOICE";
    console.log(
      `${o.publicNumber.padEnd(14)} ${flag.padEnd(28)} paidAt=${
        o.paidAt?.toISOString() ?? "-"
      } total=${o.grandTotal} ${o.currency}`,
    );
  }

  // 2. Numbering bootstrap — Setting row for invoice.next.<currentYear>
  const year = new Date().getFullYear();
  const settingKey = `invoice.next.${year}`;
  const setting = await prisma.setting.findUnique({
    where: { key: settingKey },
  });
  console.log("\n─── Numbering bootstrap ───");
  if (setting) {
    console.log(`Setting "${settingKey}":`, setting.value);
  } else {
    console.log(
      `Setting "${settingKey}": MISSING — first issue call will create it (jsonb {"n": 1}).`,
    );
  }

  // 3. Supabase bucket sanity check — list 1 file from "invoices/"
  console.log("\n─── Supabase invoices bucket ───");
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    console.log(
      "  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.",
    );
  } else {
    const supa = createClient(supaUrl, supaKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // First — does the bucket itself exist?
    const { data: buckets, error: bucketErr } = await supa.storage.listBuckets();
    if (bucketErr) {
      console.log(`  listBuckets() error: ${bucketErr.message}`);
    } else {
      const found = buckets?.some((b) => b.name === INVOICES_BUCKET);
      console.log(
        `  Bucket "${INVOICES_BUCKET}" ${found ? "EXISTS" : "MISSING"} (have: ${
          buckets?.map((b) => b.name).join(", ") ?? "none"
        })`,
      );
      if (found) {
        const { data, error } = await supa.storage
          .from(INVOICES_BUCKET)
          .list(`${year}/`, { limit: 5 });
        if (error) {
          console.log(`  list("${year}/") error: ${error.message}`);
        } else {
          console.log(
            `  list("${year}/") ok, ${data?.length ?? 0} PDF(s):`,
          );
          for (const f of data ?? []) console.log(`    · ${f.name}`);
        }
      }
    }
  }

  // 4. Try to issue an invoice on the most recent PAID-without-invoice
  //    (only if --issue passed; otherwise just dry-run).
  const target = recent.find((o) => !byOrder.has(o.id));
  console.log("\n─── Issue attempt ───");
  if (!target) {
    console.log("  No paid orders missing invoices. Done.");
    return;
  }
  console.log(`  Target: ${target.publicNumber} (${target.id})`);

  if (!shouldIssue) {
    console.log("  Dry run only. Re-run with --issue to actually try issuing.");
    return;
  }

  try {
    // Use a relative path (TS will resolve via tsconfig "paths") — tsx
    // honours the same paths as Next.js does at build time.
    const { issueInvoiceForOrder } = await import(
      "../src/lib/invoices/issue.js"
    );
    const result = await issueInvoiceForOrder(target.id);
    console.log(
      `  ✓ Issued ${result.number} → ${result.pdfPath} (already=${result.alreadyIssued})`,
    );
  } catch (err) {
    console.log(`  ✗ Threw: ${(err as Error).message}`);
    if (err instanceof Error && err.stack) {
      console.log(err.stack);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
