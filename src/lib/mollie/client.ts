// ─────────────────────────────────────────────────────────────────────────
// Mollie client — thin wrapper around @mollie/api-client.
//
// One singleton per Node process. The key is read from MOLLIE_API_KEY at
// module-load — Next.js loads .env files once per process, so if the env
// var changes you must restart `pnpm dev` / redeploy for the new key to
// take effect (same story as every other server-side env var).
//
// Why a tiny wrapper instead of calling createMollieClient inline?
//   · Keeps the rest of the codebase from reaching into the Mollie package
//     directly, which makes the SDK easy to swap or mock in a test later.
//   · Gives a single `hasMollieKey()` gate we can use in UI guards and
//     middleware (e.g. hide the checkout CTA if the shop owner hasn't
//     pasted their key yet).
//   · Centralises the "Mollie call failed" logging so every call site
//     isn't reinventing error shapes.
// ─────────────────────────────────────────────────────────────────────────

import createMollieClient, {
  type MollieClient,
  Locale,
} from "@mollie/api-client";

let cached: MollieClient | null = null;

/** Is a Mollie API key configured on the server? */
export function hasMollieKey(): boolean {
  return Boolean(process.env.MOLLIE_API_KEY);
}

/**
 * Return the Mollie client singleton. Throws if MOLLIE_API_KEY is missing —
 * callers that render public UI should guard with `hasMollieKey()` first
 * and surface a friendly "Checkout not configured yet" message instead of
 * letting this throw into a 500 page.
 */
export function getMollie(): MollieClient {
  if (cached) return cached;
  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MOLLIE_API_KEY is not set. Add it to .env.local (dev) or the " +
        "Hostinger Node.js environment variables (prod).",
    );
  }
  cached = createMollieClient({ apiKey });
  return cached;
}

/**
 * Optional: Profile ID. Not required for payment creation when the key is
 * already scoped to a single profile — Mollie infers the profile from the
 * API key. We still read it so admin screens can show "you're wired to
 * profile X" and so future multi-profile setups can specify it explicitly.
 */
export function getMollieProfileId(): string | null {
  return process.env.MOLLIE_PROFILE_ID ?? null;
}

// ────────── Locale mapping ───────────────────────────────────────────────
// Mollie accepts a narrow set of BCP-47 style locales. We pass the best
// match for the shop's EN/NL/FR/RU locales so the hosted pay page matches
// what the visitor already saw on the site.

const MOLLIE_LOCALE: Record<string, Locale> = {
  en: Locale.en_US,
  nl: Locale.nl_NL,
  fr: Locale.fr_FR,
  ru: Locale.en_US, // Mollie has no ru_* locale — English is closest.
};

export function mapLocaleToMollie(locale: string): Locale {
  return MOLLIE_LOCALE[locale.toLowerCase()] ?? Locale.en_US;
}

// ────────── Terminal-state helpers ──────────────────────────────────────
// Mollie payment statuses:
//   open · pending · authorized · paid · canceled · expired · failed
// A "final" status is one that won't change further.

const FINAL_STATUSES = new Set([
  "paid",
  "canceled",
  "expired",
  "failed",
]);

export function isFinalStatus(status: string): boolean {
  return FINAL_STATUSES.has(status);
}

export function isPaidStatus(status: string): boolean {
  return status === "paid";
}
