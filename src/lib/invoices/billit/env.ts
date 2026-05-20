// ─────────────────────────────────────────────────────────────────────────
// Billit env loader.
//
// We integrate with Billit (Belgian invoicing / accountant collaboration
// platform) as a mirror of our own invoice + credit-note records. Our own
// invoice system stays the source of truth for the customer: our PDF, our
// number sequence, our delivery email. Billit becomes the accountant's
// view of the books — every invoice + credit note we issue gets shadowed
// into K'Elmus' Billit account so BTW filings can be done from there.
//
// Auth is Billit's "non-commercial" static-key flow (PartyID + Key in HTTP
// headers — see https://docs.billit.be/docs/partyid-and-key). The key is
// valid for non-commercial integrations only, defined by Billit as "an
// integration developed and used exclusively by an individual or
// organization to automate their own administration". K'Elmus running ABS
// through their own Billit account is exactly that case. If this ever gets
// resold to other webshops, swap to OAuth.
//
// Sandbox vs. production:
//   · BILLIT_BASE_URL=https://api.sandbox.billit.be  → no real books touched
//   · BILLIT_BASE_URL=https://api.billit.be          → real books, real BTW
// Sandbox and production have DIFFERENT PartyIDs — Billit issues a fresh
// one per environment. Don't paste prod PartyID against the sandbox URL
// (calls succeed against the wrong company; impossible to spot in code).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Configured Billit credentials. Returned as null when any var is missing
 * so callers can no-op silently in local dev (e.g. dev databases where we
 * don't want to push to Billit at all).
 */
export type BillitConfig = {
  baseUrl: string;
  partyId: string;
  apiKey: string;
  /**
   * "sandbox" or "production" — derived from baseUrl. Surfaced so admin UI
   * can show "you're pushing to SANDBOX" prominently to avoid confusion.
   */
  environment: "sandbox" | "production" | "unknown";
};

/** Cheap predicate for guarding UI + skipping push in local dev. */
export function hasBillitConfig(): boolean {
  return Boolean(
    process.env.BILLIT_BASE_URL &&
      process.env.BILLIT_PARTY_ID &&
      process.env.BILLIT_API_KEY,
  );
}

/**
 * Load Billit config from env. Returns null if any of the three required
 * vars is missing — caller decides whether that's a no-op (cron in dev)
 * or an error (production push pipeline).
 *
 * We trim trailing slashes from baseUrl so concatenation with "/v1/..."
 * is safe whether the env var ends with one or not.
 */
export function loadBillitConfig(): BillitConfig | null {
  const baseUrl = (process.env.BILLIT_BASE_URL ?? "").replace(/\/+$/, "");
  const partyId = process.env.BILLIT_PARTY_ID ?? "";
  const apiKey = process.env.BILLIT_API_KEY ?? "";
  if (!baseUrl || !partyId || !apiKey) return null;

  const environment: BillitConfig["environment"] = baseUrl.includes(
    "sandbox.billit.be",
  )
    ? "sandbox"
    : baseUrl.includes("api.billit.be")
      ? "production"
      : "unknown";

  return { baseUrl, partyId, apiKey, environment };
}

/**
 * Same as loadBillitConfig() but throws if config is missing. Use in
 * server actions / cron handlers where missing config is a bug, not an
 * expected state.
 */
export function requireBillitConfig(): BillitConfig {
  const cfg = loadBillitConfig();
  if (!cfg) {
    throw new Error(
      "billit/env: BILLIT_BASE_URL, BILLIT_PARTY_ID, BILLIT_API_KEY must " +
        "all be set. Local dev: add to .env.local. Production: hPanel → " +
        "Node.js app → Environment Variables.",
    );
  }
  return cfg;
}
