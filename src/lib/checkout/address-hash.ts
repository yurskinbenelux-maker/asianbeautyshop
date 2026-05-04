// ─────────────────────────────────────────────────────────────────────────
// address-hash.ts — deterministic SHA-256 hash of a shipping address.
//
// Used by the quiz-reward anti-fraud check (Max's rule B): when an order
// uses a quiz-reward coupon, we hash the destination address. If a prior
// order already shipped to the same hash with a quiz coupon, the new
// order is denied the discount (still allowed at full price).
//
// Canonicalisation rules — chosen so trivial casing / whitespace tweaks
// don't bypass the dedup, but the customer's privacy is preserved:
//   · Lowercase + trim every field
//   · Collapse internal whitespace runs
//   · Drop punctuation in postal codes (different countries format
//     differently — "1000 BE" vs "1000-BE" should hash identically)
//   · Country always uppercase 2-letter ISO
//
// What we DON'T include: name, phone, email — those can vary per order
// (gift orders to same address etc.) without triggering the dedup.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { createHash } from "node:crypto";

export type AddressForHash = {
  line1: string | null | undefined;
  line2: string | null | undefined;
  city: string | null | undefined;
  postalCode: string | null | undefined;
  country: string | null | undefined;
};

/** Returns a 64-char hex SHA-256 hash, or null if any required field is
 *  missing (caller should treat null as "can't dedup" — usually a digital
 *  order with no shipping address). */
export function hashShippingAddress(addr: AddressForHash): string | null {
  const country = (addr.country ?? "").trim().toUpperCase();
  const city = canon(addr.city);
  const postal = canon(addr.postalCode).replace(/[\s-]/g, "");
  const line1 = canon(addr.line1);
  const line2 = canon(addr.line2);

  // If we don't have at minimum a street + city + country, the dedup is
  // meaningless. Caller will skip writing the hash on the order.
  if (!country || !city || !line1) return null;

  const canonical = [line1, line2, city, postal, country].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function canon(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
