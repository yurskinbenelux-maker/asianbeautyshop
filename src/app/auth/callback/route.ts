// ─────────────────────────────────────────────────────────────────────────
// GET /auth/callback?code=…&next=/admin
//
// Supabase magic-link URLs land here.  We exchange the one-time ?code
// for a session cookie, then redirect to wherever ?next points.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin";

  // Absolute origin comes from env, NOT request.nextUrl.origin.
  // Behind Hostinger's reverse proxy the Node process sees 0.0.0.0:3000,
  // which would leak into client-facing redirects.
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(`${site}/sign-in?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${site}/sign-in?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Prevent open-redirect: only allow relative paths back into our site.
  const safeNext = next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/admin";

  return NextResponse.redirect(`${site}${safeNext}`);
}
