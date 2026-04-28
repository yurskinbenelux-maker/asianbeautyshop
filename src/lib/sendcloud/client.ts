// ─────────────────────────────────────────────────────────────────────────
// Sendcloud REST client — thin wrapper over the v2 panel API.
//
// API base:   https://panel.sendcloud.sc/api/v2/
// Auth:       HTTP Basic with `<public_key>:<secret_key>`
// Docs:       https://api.sendcloud.dev/
//
// Why a wrapper rather than calling fetch() inline:
//   • We need consistent auth, error parsing, and timeout behaviour
//     across every endpoint we call (parcels, returns, statuses).
//   • Sendcloud returns 4xx/5xx with JSON error bodies that include a
//     `message` field and (sometimes) per-field errors. We want one
//     place to decode that into `SendcloudError` instances callers can
//     pattern-match on.
//   • We want a single seam to mock in tests later.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

const BASE_URL =
  process.env.SENDCLOUD_BASE_URL?.replace(/\/$/, "") ??
  "https://panel.sendcloud.sc/api/v2";

/**
 * Whether the Sendcloud client is configured. Callers (sync, webhook)
 * use this to decide whether to attempt API calls or skip silently —
 * the same pattern as `getResend()` returning null when there's no key.
 */
export function isSendcloudConfigured(): boolean {
  return Boolean(
    process.env.SENDCLOUD_PUBLIC_KEY && process.env.SENDCLOUD_SECRET_KEY,
  );
}

function basicAuthHeader(): string {
  const pub = process.env.SENDCLOUD_PUBLIC_KEY ?? "";
  const sec = process.env.SENDCLOUD_SECRET_KEY ?? "";
  // Buffer is fine here because this module is "server-only" — never
  // shipped to the client bundle.
  const token = Buffer.from(`${pub}:${sec}`).toString("base64");
  return `Basic ${token}`;
}

export class SendcloudError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "SendcloudError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Abort the request if the server doesn't respond in N ms. Default 15s. */
  timeoutMs?: number;
};

/**
 * Issue a Sendcloud API request. Returns the parsed JSON body on 2xx,
 * throws SendcloudError otherwise. Path can be relative ("/parcels")
 * or absolute — useful when Sendcloud sends us a "next" link that's
 * already a full URL.
 */
export async function sendcloudFetch<T>(
  path: string,
  { method = "GET", body, timeoutMs = 15_000 }: RequestOptions = {},
): Promise<T> {
  if (!isSendcloudConfigured()) {
    throw new SendcloudError(
      "Sendcloud is not configured (missing SENDCLOUD_PUBLIC_KEY or SENDCLOUD_SECRET_KEY).",
      0,
    );
  }

  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: basicAuthHeader(),
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      // Sendcloud sets long-lived cache headers we don't want to honour
      // — every API call should hit the API, not Next.js's data cache.
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new SendcloudError(
        `Sendcloud request timed out after ${timeoutMs}ms`,
        0,
      );
    }
    throw new SendcloudError(
      `Sendcloud request failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      0,
    );
  }
  clearTimeout(timer);

  // Sendcloud uses 200/201 for success; both are fine.
  const text = await res.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON body (rare; usually a 502 from the edge) — fall through
      // and surface as a SendcloudError.
    }
  }

  if (!res.ok) {
    const body = parsed as
      | { error?: { message?: string }; message?: string }
      | undefined;
    const message =
      body?.error?.message ?? body?.message ?? `HTTP ${res.status}`;
    throw new SendcloudError(message, res.status, parsed ?? text);
  }

  return parsed as T;
}
