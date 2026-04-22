// ─────────────────────────────────────────────────────────────────────────
// GET /auth/callback?code=…&next=/admin
//
// Supabase magic-link URLs land here.  We exchange the one-time ?code
// for a session cookie, then redirect to wherever ?next points.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Prevent open-redirect: only allow relative paths back into our site.
  const safeNext = next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/admin";

  return NextResponse.redirect(`${origin}${safeNext}`);
}
