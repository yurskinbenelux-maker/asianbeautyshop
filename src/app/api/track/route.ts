// ─────────────────────────────────────────────────────────────────────────
// POST /api/track — visitor presence heartbeat.
//
// Every public page mounts <VisitorTracker /> which calls this endpoint
// once on load and every 60s after that while the tab stays open. The
// only purpose is to power the admin "visitors online" widget; we don't
// log this anywhere else.
//
// The heartbeat payload is { path: "/shop" } — no PII. Server adds:
//   · sessionId    — from the `yur_session` cookie (set if missing)
//   · userAgent    — from the request header (used to flag bots)
//   · isBot        — pattern-match on common crawler UAs
//   · isAdmin      — true if a Supabase admin session exists
//   · lastSeenAt   — NOW()
//
// One row per session (UPSERT on sessionId) so the table stays small —
// it never holds more rows than there are unique recent visitors.
// Older-than-24h rows are dropped by /api/cron/visitor-ping-purge.
//
// GDPR note: the cookie is strictly-necessary for capacity monitoring,
// not cross-site tracking, no consent banner required. We deliberately
// do NOT store IP — the sessionId is opaque + scoped to our domain.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cookie config — 90-day TTL, lax SameSite (works across page navigations
// inside our domain, doesn't leak to third parties). HttpOnly so client
// JS can't read it, just send it back on /api/track.
const COOKIE_NAME = "yur_session";
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

// Common bot UAs we don't want polluting the visitor count. The admin
// widget filters these out via the isBot column. We still RECORD the
// row (it's useful for debugging) — just not counted as a person.
const BOT_RE =
  /bot|crawler|spider|crawling|googlebot|bingbot|yandex|duckduck|baidu|facebookexternalhit|whatsapp|slurp|ahrefs|semrush|petalbot|gptbot|chatgpt|claudebot/i;

type Body = {
  path?: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // Empty body is fine — we still record the ping with a "/" path.
  }

  const path = sanitisePath(body.path ?? "/");
  const userAgent = req.headers.get("user-agent") ?? "";
  const isBot = BOT_RE.test(userAgent);

  // Resolve / mint sessionId. Prisma upsert keys on it, so a stable
  // cookie means one row per visitor across the whole session.
  const cookieJar = await cookies();
  let sessionId = cookieJar.get(COOKIE_NAME)?.value;
  let mintedNewSession = false;
  if (!sessionId || sessionId.length < 16) {
    sessionId = crypto.randomUUID();
    mintedNewSession = true;
  }

  // Detect admin so we don't pollute the live-visitors count with
  // an admin + Max sitting in the admin panel. Cheap — Supabase server
  // client just reads cookies. isAdminEmail() checks the env allow-list
  // so unconfirmed users don't accidentally suppress the count.
  let isAdmin = false;
  try {
    const supa = await createSupabaseServerClient();
    const { data } = await supa.auth.getUser();
    if (data.user?.email) {
      isAdmin = isAdminEmail(data.user.email);
    }
  } catch {
    /* unauthenticated — public visitor */
  }

  try {
    await prisma.visitorPing.upsert({
      where: { sessionId },
      create: {
        sessionId,
        path,
        userAgent: userAgent.slice(0, 512), // hard cap, no need for full UA
        isBot,
        isAdmin,
      },
      update: {
        path,
        userAgent: userAgent.slice(0, 512),
        isBot,
        isAdmin,
        lastSeenAt: new Date(),
      },
    });
  } catch (err) {
    // Tracking must never break a page. Log + ack.
    console.warn("[track] ping write failed", err);
  }

  const res = NextResponse.json({ ok: true });
  if (mintedNewSession) {
    res.cookies.set(COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: COOKIE_TTL_SECONDS,
    });
  }
  return res;
}

/** Strip query strings + fragments, cap length. The path is just a
 *  debugging hint for "what page are most visitors on right now"; we
 *  don't need ?utm=... noise. */
function sanitisePath(raw: string): string {
  const noQuery = raw.split("?")[0]?.split("#")[0] ?? "/";
  return noQuery.slice(0, 200);
}
