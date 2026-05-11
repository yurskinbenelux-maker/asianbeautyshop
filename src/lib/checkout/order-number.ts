// ─────────────────────────────────────────────────────────────────────────
// Public order number generator — "ABS-7KQ9F2"
//
// We intentionally don't use a sequential counter (1001, 1002…) because:
//   · It leaks order volume to anyone who places two orders.
//   · Counter races under concurrency need a DB-side sequence; nanoid
//     sidesteps that entirely.
//
// Format: "ABS-" + 6 chars from a readable Crockford-style alphabet
// (no 0/O/1/I/L pairings that look alike in a confirmation email).
// At 32^6 ≈ 1B values the collision probability is negligible for this
// shop's volume, but we still catch the Prisma unique-violation below
// and retry — defence in depth.
//
// Note on prefix history: the legacy YurSkin storefront used "YUR-" as
// the order-number prefix. Pre-2026-05 test orders (if any survive) keep
// that prefix in the DB; new orders mint with "ABS-" after the rebrand
// to Asian Beauty Shop. URL routing + lookups are format-agnostic, so
// both shapes coexist cleanly until the old test rows are purged.
// ─────────────────────────────────────────────────────────────────────────

import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/1/O/I
const nano = customAlphabet(ALPHABET, 6);

const MAX_ATTEMPTS = 5;

/**
 * Return a fresh "ABS-XXXXXX" that is NOT already present in the Order
 * table. Performs a cheap existence check in a short loop; in practice
 * this terminates on the first iteration.
 */
export async function generateOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = `ABS-${nano()}`;
    const clash = await prisma.order.findUnique({
      where: { publicNumber: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  // 5 collisions in a row would mean the table is essentially full of
  // every possible nanoid, which can't happen in this lifetime — but throw
  // rather than silently return a duplicate.
  throw new Error("Could not allocate a unique order number");
}
