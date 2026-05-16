// ─────────────────────────────────────────────────────────────────────────
// Credit-note numbering — atomic per-year sequence, mirrors invoices.
//
// Belgian Code TVA Art. 53octies (and the same Royal Decree no. 1 art. 5
// that governs invoices) requires creditnota numbers to be unique,
// sequential, and gap-free. Auditors compare CN numbers against the
// calendar; gaps trigger questions. Format:
//
//   CN-2026-00042
//
// Year segment resets every 1 January (per-year sequence keeps numbers
// short and lets the accountant filter cleanly by financial year).
// 5-digit zero-fill gives us up to 99,999 credit notes per year — well
// above any realistic shop volume.
//
// Atomicity matters because A1 (auto-issue Mollie refund on return
// receipt) and admin-triggered partial refunds can both fire concurrently
// for different returns. Two parallel reads of "next sequence" without a
// lock would issue the same number twice; the unique index would reject
// the loser, and a retry would skip a number — exactly the gap auditors
// flag. We use the same Postgres atomic UPSERT pattern the invoice
// numbering uses (Setting row + jsonb_build_object with COALESCE +1).
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

/**
 * Reserve the next credit-note number for `year`. Atomic — safe to call
 * from concurrent return-handling code paths. Returns the formatted
 * "CN-2026-00042" plus the raw year + sequence for the CreditNote row.
 */
export async function reserveNextCreditNoteNumber(year: number): Promise<{
  number: string;
  year: number;
  sequence: number;
}> {
  // Setting row keyed by `creditnote.next.${year}`; valueJson payload is
  // { "n": <number> }. The UPSERT-then-RETURNING is a single SQL statement
  // so Postgres serialises it per row — concurrent callers get distinct
  // sequence values.
  //
  // Mirrors src/lib/invoices/numbering.ts exactly so future sweeps that
  // touch one will recognise the pattern in the other.
  const key = `creditnote.next.${year}`;

  const rows = await prisma.$queryRaw<{ n: number }[]>`
    INSERT INTO "Setting" ("key", "valueJson", "updatedAt")
    VALUES (${key}, '{"n":1}'::jsonb, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "valueJson" = jsonb_build_object(
        'n', COALESCE(("Setting"."valueJson"->>'n')::int, 0) + 1
      ),
      "updatedAt" = NOW()
    RETURNING ("valueJson"->>'n')::int AS n;
  `;

  const sequence = rows[0]?.n;
  if (!sequence || sequence < 1) {
    // Belt-and-braces: if the row didn't return for some reason, refuse to
    // issue rather than risk a duplicate. The caller's job to retry.
    throw new Error("creditnote-numbering/no-sequence-returned");
  }

  return {
    number: formatCreditNoteNumber(year, sequence),
    year,
    sequence,
  };
}

/** "CN-2026-00042" — single source of truth so callers can't drift. */
export function formatCreditNoteNumber(year: number, sequence: number): string {
  return `CN-${year}-${String(sequence).padStart(5, "0")}`;
}

/**
 * Peek at the current high-water mark without incrementing — useful for
 * the admin VAT dashboard (#334 / A5) which wants to display "next
 * credit note will be CN-2026-00043" without burning a sequence value.
 *
 * Returns 0 if the year hasn't been opened yet (no credit notes issued
 * for this calendar year), in which case the next call to
 * reserveNextCreditNoteNumber will allocate sequence 1.
 */
export async function peekCurrentCreditNoteSequence(
  year: number,
): Promise<number> {
  const key = `creditnote.next.${year}`;
  const rows = await prisma.$queryRaw<{ n: number | null }[]>`
    SELECT ("valueJson"->>'n')::int AS n
    FROM "Setting"
    WHERE "key" = ${key};
  `;
  return rows[0]?.n ?? 0;
}
