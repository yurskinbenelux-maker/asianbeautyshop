// ─────────────────────────────────────────────────────────────────────────
// Server-side consent helpers.
//
// Two responsibilities:
//   1. Read / write the `yur_consent` cookie (non-HttpOnly so the client
//      banner can self-hide without a server call on every page view).
//   2. Write an immutable ConsentLog row for GDPR audit purposes. Each
//      purpose (necessary / analytics / marketing) is one row with its
//      grant state, hashed IP, and user-agent snapshot.
// ─────────────────────────────────────────────────────────────────────────

import { cookies, headers } from "next/headers";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_VERSION,
  type ConsentPrefs,
  CONSENT_PURPOSES,
} from "./types";

/** Hash an IP for the ConsentLog so we keep an audit trail without
 *  retaining identifiable data. SHA-256 truncated to 16 hex chars = 64 bits
 *  of entropy — plenty for audit, too narrow to reverse. */
function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/** Best-effort client IP from the common proxy headers.  Returns null when
 *  running locally without a proxy. */
async function getClientIp(): Promise<string | null> {
  const h = await headers();
  // x-forwarded-for can be a comma-separated list; the first entry is the
  // original client (subsequent ones are intermediate proxies).
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") ?? null;
}

/** Read and parse the consent cookie. Returns null when the cookie is
 *  missing, malformed, or the version doesn't match — all of which should
 *  result in the banner being shown. */
export async function readConsentCookie(): Promise<ConsentPrefs | null> {
  const jar = await cookies();
  const raw = jar.get(CONSENT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<ConsentPrefs>;
    if (parsed.v !== CONSENT_VERSION) return null;
    if (typeof parsed.analytics !== "boolean") return null;
    if (typeof parsed.marketing !== "boolean") return null;
    if (typeof parsed.ts !== "string") return null;
    return {
      v: CONSENT_VERSION,
      necessary: true,
      analytics: parsed.analytics,
      marketing: parsed.marketing,
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

/** Write the consent cookie. Serialised as URL-encoded JSON so a naive
 *  `document.cookie` split still works on the client. */
export async function writeConsentCookie(prefs: ConsentPrefs): Promise<void> {
  const jar = await cookies();
  jar.set(CONSENT_COOKIE, encodeURIComponent(JSON.stringify(prefs)), {
    httpOnly: false, // client JS reads this to self-hide the banner
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONSENT_COOKIE_MAX_AGE,
  });
}

/** Append one ConsentLog row per purpose. We fire-and-forget the audit log
 *  — if the DB call fails we still let the banner close, since the cookie
 *  itself is the canonical consent record. Worst case an admin loses some
 *  audit granularity for that one visitor; better than the banner looking
 *  broken. */
export async function recordConsentAudit({
  prefs,
  userId,
  sessionId,
}: {
  prefs: ConsentPrefs;
  userId?: string | null;
  sessionId?: string | null;
}): Promise<void> {
  try {
    const h = await headers();
    const userAgent = h.get("user-agent")?.slice(0, 255) ?? null;
    const ipHash = hashIp(await getClientIp());

    const rows = CONSENT_PURPOSES.map((purpose) => ({
      userId: userId ?? null,
      sessionId: sessionId ?? null,
      ipHash,
      userAgent,
      purpose,
      granted:
        purpose === "necessary"
          ? true
          : purpose === "analytics"
            ? prefs.analytics
            : prefs.marketing,
    }));
    await prisma.consentLog.createMany({ data: rows });
  } catch (err) {
    console.error("[consent] audit log failed (non-fatal):", err);
  }
}
