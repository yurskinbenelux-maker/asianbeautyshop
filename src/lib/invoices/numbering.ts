// ─────────────────────────────────────────────────────────────────────────
// Invoice numbering — atomic per-year sequence.
//
// Belgian Royal Decree no. 1, art. 5 requires unique sequential invoice
// numbers with no gaps. Auditors will compare invoice numbers against
// the calendar; gaps trigger questions. The format is:
//
//   INV-2026-00042
//
// Year segment resets every 1 January (a per-year sequence keeps the
// numbers shorter and lets the accountant filter cleanly by financial
// year). The padded 5-digit zero-fill gives us up to 99,999 invoices
// per year before the format would need widening — comfortably above
// any realistic launch volume.
//
// Atomicity matters because the Mollie webhook can fire concurrent
// PAID transitions (multiple customers paying within the same second).
// Two parallel reads of "next sequence" without a lock would issue the
// same number twice, which would make the unique index reject the
// later one and could leave a gap. We use Postgres's atomic UPDATE
// with RETURNING to avoid the race.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

/**
 * Reserve the next invoice number for `year`. Atomic — safe to call from
 * concurrent webhook handlers. Returns the formatted "INV-2026-00042" plus
 * the raw year + sequence for the Invoice row.
 */
export async function reserveNextInvoiceNumber(year: number): Promise<{
  number: string;
  year: number;
  sequence: number;
}> {
  // We use a Setting row keyed by `invoice.next.${year}` whose value JSON is
  // simply { "n": <number> }. The atomic step is `UPDATE ... SET value = ...
  // RETURNING value` which Postgres serialises per row. Two concurrent
  // webhooks both increment correctly — the second sees the post-write
  // value of the first.
  const key = `invoice.next.${year}`;

  // Using $queryRaw for the UPSERT-then-increment because Prisma's
  // declarative API can't atomically read+write the JSONB cell. The SQL
  // is a single statement; Postgres takes a row-level lock for us.
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    INSERT INTO "Setting" ("key", "value", "updatedAt")
    VALUES (${key}, '{"n":1}'::jsonb, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = jsonb_build_object(
        'n', COALESCE(("Setting"."value"->>'n')::int, 0) + 1
      ),
      "updatedAt" = NOW()
    RETURNING ("value"->>'n')::int AS n;
  `;

  const sequence = rows[0]?.n;
  if (!sequence || sequence < 1) {
    // Belt-and-braces: if the row didn't return for some reason, refuse
    // to issue a number rather than risk a duplicate. The webhook caller
    // catches and retries.
    throw new Error("invoice-numbering/no-sequence-returned");
  }

  return {
    number: formatInvoiceNumber(year, sequence),
    year,
    sequence,
  };
}

/** "INV-2026-00042" — keep formatting in one place so callers can't drift. */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(5, "0")}`;
}
