// ─────────────────────────────────────────────────────────────────────────
// Billit HTTP client.
//
// Thin fetch wrapper that:
//   · Reads PartyID + Key from env via loadBillitConfig()
//   · Adds the two required headers (PartyID, Authorization)
//   · Serialises JSON bodies
//   · Throws a typed BillitError on non-2xx so call sites get useful info
//
// Why not pull in @billit/api-client or similar? At time of writing, there
// is no official Node SDK. The Billit REST surface we need is small (POST
// /v1/orders + GET /v1/orders/{id} + maybe /v1/account/sequences), so the
// SDK shop's-worth of code we'd avoid is < 50 lines. Better to own it.
//
// Retries: NOT handled here. The push pipeline (step 3) owns retry policy
// because retry semantics differ per operation:
//   · POST /v1/orders is idempotent if we use Billit's idempotent-token
//     header (X-Idempotency-Token), so safe to retry.
//   · GET /v1/orders/{id} is always safe.
// Putting retries here would hide that distinction from the caller.
// ─────────────────────────────────────────────────────────────────────────

import { loadBillitConfig, requireBillitConfig } from "./env";

/**
 * Structured error thrown by billitFetch on any non-2xx response. Call
 * sites can `instanceof BillitError` to log + classify (400 vs. 401 vs.
 * 5xx → different retry behaviour).
 */
export class BillitError extends Error {
  status: number;
  /** The endpoint path that errored — for logs. */
  path: string;
  /** Raw response body (parsed as JSON if possible, else string). */
  body: unknown;

  constructor(args: {
    status: number;
    path: string;
    body: unknown;
    message: string;
  }) {
    super(args.message);
    this.name = "BillitError";
    this.status = args.status;
    this.path = args.path;
    this.body = args.body;
  }

  /** True for transient errors that retry might fix. */
  isRetryable(): boolean {
    // 5xx: server hiccup. 429: rate limited. 408: request timeout.
    return this.status >= 500 || this.status === 429 || this.status === 408;
  }
}

type RequestOptions = {
  /**
   * Optional idempotency key — Billit dedupes POSTs with the same value.
   * For sales invoice push we use the Invoice.id (UUID) so two webhook
   * retries map to one Billit invoice.
   */
  idempotencyKey?: string;
  /** Override config (mostly for tests). */
  configOverride?: ReturnType<typeof loadBillitConfig>;
};

/**
 * Make an authenticated request to Billit. Returns the parsed JSON body
 * on 2xx, throws BillitError otherwise.
 *
 * `path` MUST start with "/" (e.g. "/v1/orders"). We prefix the configured
 * base URL.
 *
 * `body` may be omitted for GET; pass a plain object otherwise — we JSON
 * stringify and set Content-Type.
 */
export async function billitFetch<TResponse = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<TResponse> {
  const cfg = options.configOverride ?? requireBillitConfig();

  const headers: Record<string, string> = {
    // Billit's PartyID + Authorization header pattern. The PartyID
    // identifies the K'Elmus company in Billit (sandbox + production
    // have different IDs). The key is shared across all companies the
    // key-owner has access to.
    PartyID: cfg.partyId,
    Authorization: cfg.apiKey,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    // https://docs.billit.be/docs/idempotent-tokens — Billit recognises
    // X-Idempotency-Token and replays the original response on collision.
    headers["X-Idempotency-Token"] = options.idempotencyKey;
  }

  const url = `${cfg.baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Server-side only — no browser cache to fight.
    cache: "no-store",
  });

  const raw = await res.text();
  let parsed: unknown = raw;
  if (raw && (res.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // leave as raw string
    }
  }

  if (!res.ok) {
    throw new BillitError({
      status: res.status,
      path,
      body: parsed,
      message: `Billit ${method} ${path} → ${res.status}`,
    });
  }

  return parsed as TResponse;
}

/**
 * Tiny health-check call. Used by /admin/billit to show the connection
 * status before we trust the push pipeline. We hit /v1/account because
 * it's cheap, authenticated, and returns the configured party — so a 200
 * proves both the key works AND the PartyID matches a real company.
 *
 * Returns the raw response body so the admin UI can render the company
 * name + VAT number for sanity check ("yes, this is K'Elmus, not the
 * wrong company by accident").
 */
export async function billitPing(): Promise<
  | { ok: true; environment: string; body: unknown }
  | { ok: false; error: string }
> {
  const cfg = loadBillitConfig();
  if (!cfg) {
    return { ok: false, error: "billit/env: config not set" };
  }
  try {
    const body = await billitFetch("GET", "/v1/account", undefined, {
      configOverride: cfg,
    });
    return { ok: true, environment: cfg.environment, body };
  } catch (e) {
    if (e instanceof BillitError) {
      return { ok: false, error: `${e.message} · body=${JSON.stringify(e.body)}` };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
