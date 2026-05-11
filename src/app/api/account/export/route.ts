// ─────────────────────────────────────────────────────────────────────────
// GET /api/account/export
//
// Article 15 (right of access) — streams a JSON archive of everything we
// hold on the signed-in user as a downloadable file.  The browser gets a
// Content-Disposition: attachment with a filename like
//
//     asianbeautyshop-my-data-2026-04-23.json
//
// Guarded by requireCustomer(): unauthenticated callers are redirected
// to /sign-in via the standard redirect.  There's no rate-limit here yet
// — the operation is cheap and only yields the caller's own data.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { buildUserDataArchive } from "@/lib/queries/gdpr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { profile } = await requireCustomer({
    // Fall back to English prefix; this route is invoked from the account
    // page, which always sends the user back to their own locale after a
    // successful sign-in.
    locale: "en",
    redirectTo: "/account/privacy",
  });

  const archive = await buildUserDataArchive(profile.id);
  const body = JSON.stringify(archive, null, 2);

  const today = new Date().toISOString().slice(0, 10);
  const filename = `asianbeautyshop-my-data-${today}.json`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
